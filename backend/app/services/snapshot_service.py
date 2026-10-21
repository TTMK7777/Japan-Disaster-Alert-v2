"""表示用スナップショットの生成とメモリキャッシュ（B5）。

- SnapshotBuilder: 地震・津波（発表中）・噴火警報を取得し、dataset ごとの成否と
  取得成功時刻を付けて 1 つにまとめる。1 つの dataset の失敗で全体を落とさない。
  失敗した dataset は前回成功値があれば stale、無ければ error（items=null）にする
- SnapshotCache: 最後のスナップショットをメモリに持ち、SNAPSHOT_MAX_AGE_SECONDS より
  古ければ作り直す。同時に来たリクエストは 1 本の生成を待つ（多重生成しない）

気象警報（府県予報区 58 件）は入れていない。毎分 58 件を全部取るかは設計メモの
判断待ち（docs/ops/deployment.md「表示用スナップショット」参照）。
"""
from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Mapping, Optional

import httpx

from ..snapshot_models import (
    DatasetStatus,
    EarthquakeItem,
    EarthquakesDataset,
    Snapshot,
    SnapshotDatasets,
    SnapshotSource,
    SourceProvider,
    TsunamiArea,
    TsunamiDataset,
    TsunamiItem,
    VolcanoWarningItem,
    VolcanoWarningsDataset,
)
from ..utils.logger import get_logger
from .p2p_service import P2PQuakeService
from .tsunami_service import ActiveTsunamiReport, select_active_tsunami_reports

logger = get_logger(__name__)

#: スナップショットを作り直す間隔（秒）。Cache-Control の max-age と同じ値
SNAPSHOT_MAX_AGE_SECONDS = 60
#: 期限切れ後もキャッシュが古い版を返しながら再検証してよい秒数。
#: max-age（生成からの残り秒）と合わせ、利用者が見る最悪の古さを約 2 分に抑える
SNAPSHOT_STALE_WHILE_REVALIDATE_SECONDS = 30
#: 前回成功値を stale として出し続けてよい上限（秒）。超えたら error（items=null）に落とす。
#: 表示側が fetched_at を見なくても、古い「津波なし」が出続けないようにする
SNAPSHOT_STALE_LIMIT_SECONDS = 15 * 60
#: 1 つの dataset の取得にかける上限（秒）。超えたらその dataset だけ失敗扱い
SNAPSHOT_FETCH_TIMEOUT_SECONDS = 25.0
#: 直近の地震の取得件数（P2P /history の limit）
SNAPSHOT_EARTHQUAKE_LIMIT = 10

DATASET_NAMES: tuple[str, ...] = ("earthquakes", "tsunami", "volcano_warnings")

_DATASET_MODELS = {
    "earthquakes": EarthquakesDataset,
    "tsunami": TsunamiDataset,
    "volcano_warnings": VolcanoWarningsDataset,
}

SOURCE = SnapshotSource(
    providers=[
        SourceProvider(
            id="jma",
            name_ja="気象庁",
            name_en="Japan Meteorological Agency",
            url="https://www.jma.go.jp/",
            role="origin",
            datasets=list(DATASET_NAMES),
        ),
        SourceProvider(
            id="p2pquake",
            name_ja="P2P地震情報",
            name_en="P2PQuake",
            url="https://www.p2pquake.net/",
            role="distributor",
            datasets=["earthquakes"],
        ),
    ],
    official=False,
    notice_ja="気象庁の発表を中継したもので、公式発表ではありません。避難の判断は市町村の情報に従ってください。",
    notice_en=(
        "Relayed from Japan Meteorological Agency announcements; not an official release. "
        "Follow your municipality's instructions for evacuation."
    ),
)

Fetcher = Callable[[], Awaitable[list]]
Clock = Callable[[], datetime]

#: 想定内の失敗（通信・HTTP ステータス・本文の解釈・時間切れ）
_EXPECTED_ERRORS = (httpx.HTTPError, ValueError, TimeoutError)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SnapshotBuilder:
    """dataset ごとの fetcher を呼んでスナップショットを組み立てる。

    前回成功値（取得成功時刻と items）は dataset ごとにこのインスタンスが持つ。
    プロセスをまたぐ場合（CLI）は seed() で前回の出力から引き継ぐ。
    """

    def __init__(self, fetchers: Mapping[str, Fetcher], *, clock: Clock = _utcnow):
        missing = set(DATASET_NAMES) - set(fetchers)
        if missing:
            raise ValueError(f"fetcher が足りない: {sorted(missing)}")
        self._fetchers = dict(fetchers)
        self._clock = clock
        self._last_success: dict[str, tuple[datetime, list]] = {}

    @property
    def fetcher_names(self) -> tuple[str, ...]:
        return tuple(self._fetchers)

    def seed(self, snapshot: Snapshot) -> None:
        """前回のスナップショットの ok / stale を前回成功値として取り込む。"""
        for name in DATASET_NAMES:
            dataset = getattr(snapshot.datasets, name)
            if dataset.status != DatasetStatus.error:
                self._last_success[name] = (dataset.fetched_at, list(dataset.items))

    async def _run(self, name: str) -> tuple[datetime, list]:
        items = await asyncio.wait_for(self._fetchers[name](), timeout=SNAPSHOT_FETCH_TIMEOUT_SECONDS)
        return self._clock(), items

    async def build(self) -> Snapshot:
        results = await asyncio.gather(
            *(self._run(name) for name in DATASET_NAMES), return_exceptions=True
        )
        datasets = {}
        for name, result in zip(DATASET_NAMES, results):
            model = _DATASET_MODELS[name]
            if isinstance(result, BaseException):
                if not isinstance(result, Exception):
                    # CancelledError・KeyboardInterrupt は握らない
                    raise result
                self._log_failure(name, result)
                previous = self._last_success.get(name)
                if previous is not None and self._too_old(previous[0]):
                    logger.warning(f"スナップショット: {name} の前回成功値が古すぎるので error にする")
                    previous = None
                if previous is None:
                    datasets[name] = model(status=DatasetStatus.error, fetched_at=None, items=None)
                else:
                    fetched_at, items = previous
                    datasets[name] = model(status=DatasetStatus.stale, fetched_at=fetched_at, items=items)
                continue
            fetched_at, items = result
            self._last_success[name] = (fetched_at, items)
            datasets[name] = model(status=DatasetStatus.ok, fetched_at=fetched_at, items=items)

        return Snapshot(
            generated_at=self._clock(),
            source=SOURCE,
            datasets=SnapshotDatasets(**datasets),
        )

    def _too_old(self, fetched_at: datetime) -> bool:
        return (self._clock() - fetched_at).total_seconds() > SNAPSHOT_STALE_LIMIT_SECONDS

    @staticmethod
    def _log_failure(name: str, exc: Exception) -> None:
        # 出力（JSON）には例外の中身を載せない。ログにだけ残す
        if isinstance(exc, _EXPECTED_ERRORS):
            logger.warning(f"スナップショット: {name} の取得に失敗 ({type(exc).__name__}: {exc})")
        else:
            logger.error(f"スナップショット: {name} で想定外の例外", exc_info=exc)


# ---------------------------------------------------------------------------
# 既存サービス → スナップショットの item
# ---------------------------------------------------------------------------

_JST = timezone(timedelta(hours=9))
_P2P_TIME_FORMAT = "%Y/%m/%d %H:%M:%S"
_SCALE_BY_INTENSITY = {v: k for k, v in P2PQuakeService.INTENSITY_MAP.items()}
_TSUNAMI_CODE_BY_LABEL = {v: k for k, v in P2PQuakeService.TSUNAMI_MAP.items()}


def _p2p_time(value: str) -> Optional[datetime]:
    try:
        return datetime.strptime(value, _P2P_TIME_FORMAT).replace(tzinfo=_JST)
    except (TypeError, ValueError):
        return None


def _known_number(value, *, minimum: float):
    """P2P の番兵値（-1・-200）を null にする。"""
    if value is None or value < minimum:
        return None
    return value


def earthquake_item(eq) -> EarthquakeItem:
    pending = eq.location == P2PQuakeService.UNDETERMINED_LOCATION
    intensity = None if eq.max_intensity == "不明" else eq.max_intensity
    return EarthquakeItem(
        id=eq.id,
        occurred_at=_p2p_time(eq.time),
        location_ja=None if pending or not eq.location else eq.location,
        magnitude=_known_number(eq.magnitude, minimum=0),
        depth_km=_known_number(eq.depth, minimum=0),
        max_intensity=intensity,
        max_scale=_SCALE_BY_INTENSITY.get(intensity) if intensity else None,
        latitude=eq.latitude if -90 <= eq.latitude <= 90 else None,
        longitude=eq.longitude if -180 <= eq.longitude <= 180 else None,
        domestic_tsunami=_TSUNAMI_CODE_BY_LABEL.get(eq.tsunami_warning, "Unknown"),
    )


def _optional_str(value) -> Optional[str]:
    return None if value is None or value == "" else str(value)


def tsunami_item(active: ActiveTsunamiReport) -> TsunamiItem:
    report = active.report
    return TsunamiItem(
        event_id=str(report.get("eid") or ""),
        report_id=str(report.get("ctt") or ""),
        report_datetime=_optional_str(report.get("rdt")),
        info_type=_optional_str(report.get("ift")),
        warning_level=active.level,
        earthquake_time=_optional_str(report.get("at")),
        epicenter_ja=_optional_str(report.get("anm")),
        epicenter_en=_optional_str(report.get("en_anm")),
        magnitude=_optional_str(report.get("mag")),
        areas=[TsunamiArea(code=a.code, kind_ja=a.kind_ja, level=a.level) for a in active.areas],
    )


def volcano_item(warning) -> VolcanoWarningItem:
    return VolcanoWarningItem(
        volcano_code=warning.volcano_code,
        volcano_name_ja=warning.volcano_name,
        volcano_name_en=warning.volcano_name_en,
        alert_level=warning.alert_level,
        warning_name_ja=warning.warning_name_ja,
        condition=warning.condition,
        severity=warning.severity,
        issued_at=_optional_str(warning.issued_at),
        municipalities_ja=list(warning.municipalities),
        latitude=warning.latitude,
        longitude=warning.longitude,
    )


def build_default_fetchers(p2p_service, tsunami_service, volcano_service) -> dict[str, Fetcher]:
    """既存サービスの「失敗を例外で返す」取得関数をつないだ fetcher。"""

    async def earthquakes() -> list:
        quakes = await p2p_service.fetch_recent_earthquakes(limit=SNAPSHOT_EARTHQUAKE_LIMIT)
        return [earthquake_item(eq) for eq in quakes]

    async def tsunami() -> list:
        reports = await tsunami_service.fetch_tsunami_reports()
        return [tsunami_item(active) for active in select_active_tsunami_reports(reports)]

    async def volcano_warnings() -> list:
        return [volcano_item(w) for w in await volcano_service.fetch_volcano_warnings()]

    return {"earthquakes": earthquakes, "tsunami": tsunami, "volcano_warnings": volcano_warnings}


# ---------------------------------------------------------------------------
# メモリキャッシュ
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CachedSnapshot:
    snapshot: Snapshot
    body: bytes
    etag: str
    built_at: float  # monotonic


def serialize_snapshot(snapshot: Snapshot) -> tuple[bytes, str]:
    body = snapshot.model_dump_json().encode("utf-8")
    etag = '"' + hashlib.sha256(body).hexdigest()[:32] + '"'
    return body, etag


class SnapshotCache:
    """最後のスナップショットを持ち、古ければ 1 本だけ作り直す。"""

    def __init__(
        self,
        builder,
        *,
        max_age_seconds: float = SNAPSHOT_MAX_AGE_SECONDS,
        monotonic: Callable[[], float] = time.monotonic,
    ):
        self.builder = builder
        self.max_age_seconds = max_age_seconds
        self._monotonic = monotonic
        self._entry: Optional[CachedSnapshot] = None
        self._lock: Optional[asyncio.Lock] = None

    def remaining_seconds(self, entry: CachedSnapshot) -> int:
        """この版をあと何秒キャッシュしてよいか（Cache-Control の max-age。0 以上の整数）。"""
        return max(0, int(self.max_age_seconds - (self._monotonic() - entry.built_at)))

    def _fresh(self) -> Optional[CachedSnapshot]:
        entry = self._entry
        if entry is not None and self._monotonic() - entry.built_at < self.max_age_seconds:
            return entry
        return None

    async def get(self) -> CachedSnapshot:
        entry = self._fresh()
        if entry is not None:
            return entry
        if self._lock is None:
            self._lock = asyncio.Lock()
        async with self._lock:
            # ロック待ちの間に別のリクエストが作り終えていれば、それを使う
            entry = self._fresh()
            if entry is not None:
                return entry
            snapshot = await self.builder.build()
            body, etag = serialize_snapshot(snapshot)
            self._entry = CachedSnapshot(snapshot=snapshot, body=body, etag=etag, built_at=self._monotonic())
            return self._entry
