"""表示用スナップショットの生成（snapshot_service.SnapshotBuilder）と、実形データからの変換。

守ること（設計: .team/inbox/CDX/b5-design）:
- 1 つの dataset の失敗で全体を落とさない
- 「取得失敗」と「0 件」を区別する（失敗は items=None か前回成功値＋stale。成功の 0 件だけが []）
- 前回成功値を出すときは、その成功時刻を fetched_at に残す（今の時刻で上書きしない）
"""
import asyncio
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.services import snapshot_service
from app.services.p2p_service import P2PQuakeService
from app.services.snapshot_service import (
    DATASET_NAMES,
    SnapshotBuilder,
    build_default_fetchers,
)
from app.services.tsunami_service import TsunamiService
from app.services.volcano_service import VolcanoService
from app.snapshot_models import DatasetStatus, Snapshot

T0 = datetime(2026, 10, 22, 0, 0, 0, tzinfo=timezone.utc)


class _Clock:
    def __init__(self, start: datetime = T0):
        self.now = start

    def __call__(self) -> datetime:
        return self.now


def _ok(items):
    async def fetch():
        return list(items)
    return fetch


def _fail(exc: BaseException):
    async def fetch():
        raise exc
    return fetch


class _Switch:
    """呼ぶたびに挙動を差し替えられる fetcher。"""

    def __init__(self, items):
        self.items = items
        self.exc: BaseException | None = None
        self.calls = 0

    async def __call__(self):
        self.calls += 1
        if self.exc is not None:
            raise self.exc
        return list(self.items)


def _builder(clock=None, **overrides):
    fetchers = {name: _ok([]) for name in DATASET_NAMES}
    fetchers.update(overrides)
    return SnapshotBuilder(fetchers, clock=clock or _Clock())


def _eq_item(id_: str = "eq1"):
    from app.snapshot_models import EarthquakeItem
    return EarthquakeItem(
        id=id_, occurred_at=None, location_ja="日高地方中部", magnitude=4.2, depth_km=100,
        max_intensity="2", max_scale=20, latitude=42.6, longitude=142.7, domestic_tsunami="None",
    )


class TestStatus:
    @pytest.mark.asyncio
    async def test_全成功(self):
        snap = await _builder(earthquakes=_ok([_eq_item()])).build()
        for name in DATASET_NAMES:
            ds = getattr(snap.datasets, name)
            assert ds.status == DatasetStatus.ok
            assert ds.fetched_at == T0
            assert ds.items is not None
        assert len(snap.datasets.earthquakes.items) == 1
        assert snap.generated_at == T0
        assert snap.schema_version == "1.1"

    @pytest.mark.asyncio
    async def test_1つ失敗しても他は成功のまま(self):
        snap = await _builder(tsunami=_fail(httpx.ConnectError("down"))).build()
        assert snap.datasets.tsunami.status == DatasetStatus.error
        assert snap.datasets.earthquakes.status == DatasetStatus.ok
        assert snap.datasets.volcano_warnings.status == DatasetStatus.ok

    @pytest.mark.asyncio
    async def test_全部失敗でもスナップショットは作れる(self):
        snap = await _builder(
            earthquakes=_fail(httpx.ReadTimeout("t")),
            tsunami=_fail(ValueError("broken json")),
            volcano_warnings=_fail(httpx.HTTPStatusError("503", request=None, response=None)),
        ).build()
        for name in DATASET_NAMES:
            ds = getattr(snap.datasets, name)
            assert ds.status == DatasetStatus.error
            assert ds.fetched_at is None
            assert ds.items is None

    @pytest.mark.asyncio
    async def test_初回失敗はerror_itemsはNoneで0件と区別する(self):
        snap = await _builder(tsunami=_fail(httpx.ConnectError("down"))).build()
        assert snap.datasets.tsunami.items is None
        assert snap.datasets.tsunami.fetched_at is None

    @pytest.mark.asyncio
    async def test_成功の0件はokで空配列(self):
        snap = await _builder(tsunami=_ok([])).build()
        assert snap.datasets.tsunami.status == DatasetStatus.ok
        assert snap.datasets.tsunami.items == []

    @pytest.mark.asyncio
    async def test_前回成功ありで失敗したらstale_前回の値と時刻を保つ(self):
        clock = _Clock()
        quakes = _Switch([_eq_item("first")])
        builder = _builder(clock=clock, earthquakes=quakes)
        await builder.build()

        clock.now = T0 + timedelta(minutes=3)
        quakes.exc = httpx.ConnectError("down")
        snap = await builder.build()

        ds = snap.datasets.earthquakes
        assert ds.status == DatasetStatus.stale
        assert ds.fetched_at == T0, "stale の fetched_at は前回成功時刻（今の時刻ではない）"
        assert [i.id for i in ds.items] == ["first"]
        assert snap.generated_at == T0 + timedelta(minutes=3)

    @pytest.mark.asyncio
    async def test_staleの後に成功すればokに戻り時刻が進む(self):
        clock = _Clock()
        quakes = _Switch([_eq_item("first")])
        builder = _builder(clock=clock, earthquakes=quakes)
        await builder.build()
        quakes.exc = httpx.ConnectError("down")
        clock.now = T0 + timedelta(minutes=1)
        await builder.build()

        quakes.exc = None
        quakes.items = [_eq_item("second")]
        clock.now = T0 + timedelta(minutes=2)
        snap = await builder.build()
        assert snap.datasets.earthquakes.status == DatasetStatus.ok
        assert snap.datasets.earthquakes.fetched_at == T0 + timedelta(minutes=2)
        assert [i.id for i in snap.datasets.earthquakes.items] == ["second"]

    @pytest.mark.asyncio
    async def test_想定外の例外もそのdatasetだけerrorにする(self):
        snap = await _builder(volcano_warnings=_fail(TypeError("parser bug"))).build()
        assert snap.datasets.volcano_warnings.status == DatasetStatus.error
        assert snap.datasets.earthquakes.status == DatasetStatus.ok

    @pytest.mark.asyncio
    async def test_キャンセルは握らない(self):
        with pytest.raises(asyncio.CancelledError):
            await _builder(tsunami=_fail(asyncio.CancelledError())).build()

    @pytest.mark.asyncio
    async def test_時間切れはそのdatasetだけerror(self, monkeypatch):
        monkeypatch.setattr(snapshot_service, "SNAPSHOT_FETCH_TIMEOUT_SECONDS", 0.05)

        async def hang():
            await asyncio.sleep(10)
            return []

        snap = await _builder(tsunami=hang).build()
        assert snap.datasets.tsunami.status == DatasetStatus.error
        assert snap.datasets.earthquakes.status == DatasetStatus.ok

    @pytest.mark.asyncio
    async def test_失敗時の出力に例外の中身を載せない(self):
        # 例外メッセージには URL（認証情報を含みうる）が載る。カナリアで出力を全走査する
        canary = "CANARY-" + "snapshot-7f3a"
        snap = await _builder(tsunami=_fail(httpx.ConnectError(f"connect failed ({canary})"))).build()
        assert canary not in snap.model_dump_json()


class TestSeed:
    @pytest.mark.asyncio
    async def test_前回のスナップショットから前回成功値を引き継ぐ(self):
        previous = await _builder(earthquakes=_ok([_eq_item("old")])).build()
        clock = _Clock(T0 + timedelta(minutes=5))
        builder = _builder(clock=clock, earthquakes=_fail(httpx.ConnectError("down")))
        builder.seed(previous)
        snap = await builder.build()
        assert snap.datasets.earthquakes.status == DatasetStatus.stale
        assert snap.datasets.earthquakes.fetched_at == T0
        assert [i.id for i in snap.datasets.earthquakes.items] == ["old"]

    @pytest.mark.asyncio
    async def test_errorのdatasetは引き継がない(self):
        previous = await _builder(tsunami=_fail(httpx.ConnectError("down"))).build()
        builder = _builder(tsunami=_fail(httpx.ConnectError("down")))
        builder.seed(previous)
        snap = await builder.build()
        assert snap.datasets.tsunami.status == DatasetStatus.error


class TestSchema:
    @pytest.mark.asyncio
    async def test_出典と公式発表でない旨を持つ(self):
        snap = await _builder().build()
        data = json.loads(snap.model_dump_json())
        assert data["source"]["official"] is False
        ids = {p["id"] for p in data["source"]["providers"]}
        assert ids == {"jma", "p2pquake"}

    @pytest.mark.asyncio
    async def test_言語別の表示文を持たない(self):
        snap = await _builder(earthquakes=_ok([_eq_item()])).build()
        dumped = snap.model_dump_json()
        for key in ("message", "translated", "headline", "display"):
            assert key not in dumped

    def test_状態と中身の矛盾はモデルが拒否する(self):
        from pydantic import ValidationError
        from app.snapshot_models import TsunamiDataset
        with pytest.raises(ValidationError):
            TsunamiDataset(status="ok", fetched_at=None, items=[])
        with pytest.raises(ValidationError):
            TsunamiDataset(status="error", fetched_at=T0, items=None)
        with pytest.raises(ValidationError):
            TsunamiDataset(status="stale", fetched_at=T0, items=None)

    def test_JSON_Schemaのファイルがモデルと一致する(self):
        """docs/dev/snapshot-schema.json の書き忘れ（モデルだけ変えた）を止める。"""
        from pathlib import Path
        path = Path(__file__).resolve().parents[2] / "docs" / "dev" / "snapshot-schema.json"
        committed = json.loads(path.read_text(encoding="utf-8"))
        assert committed == Snapshot.model_json_schema(), (
            "スキーマが古い。python scripts/build_snapshot.py --write-schema docs/dev/snapshot-schema.json"
        )


# ---- 実形データ → 既定の fetcher（本番経路の変換）----

# 2026-10-22 に取得した実 P2P /history の 1 件（points は省略）と、震度速報の番兵値
P2P_DETAIL = {
    "code": 551,
    "earthquake": {
        "domesticTsunami": "None",
        "foreignTsunami": "Unknown",
        "hypocenter": {"depth": 100, "latitude": 42.6, "longitude": 142.7,
                       "magnitude": 4.2, "name": "日高地方中部"},
        "maxScale": 20,
        "time": "2026/10/21 23:41:00",
    },
    "id": "6ad8cfb6e88ee598246bf408",
    "issue": {"correct": "None", "source": "気象庁", "time": "2026/10/21 23:44:06", "type": "DetailScale"},
}
P2P_SCALE_PROMPT = {
    "code": 551,
    "earthquake": {
        "domesticTsunami": "Checking",
        "hypocenter": {"depth": -1, "latitude": -200, "longitude": -200, "magnitude": -1, "name": ""},
        "maxScale": 45,
        "time": "2026/10/21 23:50:00",
    },
    "id": "prompt",
    "issue": {"type": "ScalePrompt"},
}
TSUNAMI_ADVISORY = {
    "ctt": "20261022010500", "eid": "20261022010000", "rdt": "2026-10-22T01:05:00+09:00",
    "ttl": "津波警報・注意報・予報", "ift": "発表", "ser": 0, "at": "2026-10-22T01:00:00+09:00",
    "anm": "三陸沖", "acd": "288", "cod": "+39.0+143.0-10000/", "mag": "7.0",
    "kind": [{"code": "210", "kind": "津波注意報"}, {"code": "100", "kind": "津波予報（若干の海面変動）"}],
    "json": "x.json", "en_ttl": "Tsunami Warning/Advisory/Forecast", "en_anm": "Off Sanriku",
}
VOLCANO_LIST = [{"code": "503", "latlon": ["32.884", "131.104"], "name_jp": "阿蘇山",
                 "name_en": "Asosan", "levelOperation": True}]
VOLCANO_WARNING = [{
    "reportDatetime": "2026-08-20T14:00:00+09:00",
    "volcanoInfos": [
        {"type": "噴火警報・予報（対象火山）",
         "items": [{"name": "レベル３（入山規制）", "code": "13", "condition": "引上げ",
                    "areas": [{"name": "阿蘇山", "code": "503"}]}]},
        {"type": "噴火警報・予報（対象市町村等）",
         "items": [{"areas": [{"name": "熊本県阿蘇市", "code": "4321400"}]}]},
    ],
}]


class _Resp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                str(self.status_code), request=httpx.Request("GET", "http://x"),
                response=httpx.Response(self.status_code),
            )

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class _Router:
    def __init__(self, routes: dict):
        self.routes = routes
        self.requests: list[str] = []

    async def get(self, url, params=None, timeout=None):
        self.requests.append(url)
        for suffix, payload in self.routes.items():
            if url.endswith(suffix):
                return payload if isinstance(payload, _Resp) else _Resp(payload)
        raise AssertionError(f"想定外の URL: {url}")


@pytest.fixture
def services(monkeypatch):
    router = _Router({
        "/history": [P2P_DETAIL, P2P_SCALE_PROMPT],
        "/tsunami/data/list.json": [TSUNAMI_ADVISORY],
        "/volcano/data/warning.json": VOLCANO_WARNING,
        "/volcano/const/volcano_list.json": VOLCANO_LIST,
    })
    p2p, tsunami, volcano = P2PQuakeService(), TsunamiService(), VolcanoService()
    for svc in (p2p, tsunami, volcano):
        monkeypatch.setattr(svc, "_get_client", lambda: router)
    return p2p, tsunami, volcano, router


class TestDefaultFetchers:
    @pytest.mark.asyncio
    async def test_実形データから3つとも組み立てる(self, services):
        p2p, tsunami, volcano, _ = services
        snap = await SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock()).build()

        eqs = snap.datasets.earthquakes.items
        assert [e.id for e in eqs] == ["6ad8cfb6e88ee598246bf408", "prompt"]
        assert eqs[0].occurred_at == datetime(2026, 10, 21, 23, 41, tzinfo=timezone(timedelta(hours=9)))
        assert (eqs[0].magnitude, eqs[0].depth_km, eqs[0].max_intensity, eqs[0].max_scale) == (4.2, 100, "2", 20)
        # 震度速報の番兵値（-1 / -200 / 空文字）は null にする。0 や「調査中」の文にしない
        prompt = eqs[1]
        assert (prompt.magnitude, prompt.depth_km, prompt.latitude, prompt.longitude) == (None, None, None, None)
        assert prompt.location_ja is None
        assert prompt.max_intensity == "5弱"
        assert prompt.domestic_tsunami == "Checking"

        ts = snap.datasets.tsunami.items
        assert len(ts) == 1
        assert ts[0].warning_level == "advisory"
        assert [(a.code, a.level) for a in ts[0].areas] == [("210", "advisory")]
        assert ts[0].event_id == "20261022010000"

        vs = snap.datasets.volcano_warnings.items
        assert len(vs) == 1
        assert (vs[0].volcano_code, vs[0].alert_level, vs[0].volcano_name_en) == ("503", 3, "Asosan")
        assert vs[0].municipalities_ja == ["熊本県阿蘇市"]

    @pytest.mark.asyncio
    async def test_P2Pの非200はerrorで0件にしない(self, services):
        p2p, tsunami, volcano, router = services
        router.routes["/history"] = _Resp([], status=503)
        snap = await SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock()).build()
        assert snap.datasets.earthquakes.status == DatasetStatus.error
        assert snap.datasets.earthquakes.items is None

    @pytest.mark.asyncio
    async def test_P2Pが全件パース不能ならerror(self, services):
        p2p, tsunami, volcano, router = services
        router.routes["/history"] = [{"earthquake": "壊れた形"}]
        snap = await SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock()).build()
        assert snap.datasets.earthquakes.status == DatasetStatus.error

    @pytest.mark.asyncio
    async def test_津波一覧の壊れた本文はerror(self, services):
        p2p, tsunami, volcano, router = services
        router.routes["/tsunami/data/list.json"] = _Resp(json.JSONDecodeError("x", "<html>", 0))
        snap = await SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock()).build()
        assert snap.datasets.tsunami.status == DatasetStatus.error
        assert snap.datasets.earthquakes.status == DatasetStatus.ok

    @pytest.mark.asyncio
    async def test_火山はキャッシュを成功に数えない(self, services):
        """VolcanoService の TTL キャッシュ（失敗時は古い値を返す）を最新確認に数えない。"""
        p2p, tsunami, volcano, router = services
        fetchers = build_default_fetchers(p2p, tsunami, volcano)
        builder = SnapshotBuilder(fetchers, clock=_Clock())
        await builder.build()
        router.routes["/volcano/data/warning.json"] = _Resp([], status=503)
        snap = await builder.build()
        assert snap.datasets.volcano_warnings.status == DatasetStatus.stale

    @pytest.mark.asyncio
    async def test_火山は毎回warning_jsonを取りに行く(self, services):
        p2p, tsunami, volcano, router = services
        builder = SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock())
        await builder.build()
        await builder.build()
        hits = [u for u in router.requests if u.endswith("data/warning.json")]
        assert len(hits) == 2


class TestStaleLimit:
    """最後の成功から 15 分を過ぎた dataset は error（items=null）に落とす。

    表示側が fetched_at を見なくても、古い「津波なし」が出続けないようにする。
    """

    @pytest.mark.asyncio
    async def test_15分以内はstale_過ぎたらerror(self):
        clock = _Clock()
        quakes = _Switch([_eq_item("first")])
        builder = _builder(clock=clock, earthquakes=quakes)
        await builder.build()
        quakes.exc = httpx.ConnectError("down")

        clock.now = T0 + timedelta(seconds=snapshot_service.SNAPSHOT_STALE_LIMIT_SECONDS)
        assert (await builder.build()).datasets.earthquakes.status == DatasetStatus.stale

        clock.now = T0 + timedelta(seconds=snapshot_service.SNAPSHOT_STALE_LIMIT_SECONDS + 1)
        ds = (await builder.build()).datasets.earthquakes
        assert ds.status == DatasetStatus.error
        assert ds.items is None and ds.fetched_at is None

    def test_上限は15分(self):
        assert snapshot_service.SNAPSHOT_STALE_LIMIT_SECONDS == 15 * 60

    @pytest.mark.asyncio
    async def test_前回ファイルから引き継いだ値にも上限が効く(self):
        previous = await _builder(tsunami=_ok([])).build()
        clock = _Clock(T0 + timedelta(minutes=16))
        builder = _builder(clock=clock, tsunami=_fail(httpx.ConnectError("down")))
        builder.seed(previous)
        assert (await builder.build()).datasets.tsunami.status == DatasetStatus.error


class TestUnreadableUpstream:
    @pytest.mark.asyncio
    async def test_津波のkindをkindsに改名した形はokにしない(self, services):
        p2p, tsunami, volcano, router = services
        renamed = dict(TSUNAMI_ADVISORY)
        renamed["kinds"] = renamed.pop("kind")
        router.routes["/tsunami/data/list.json"] = [renamed]
        snap = await SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock()).build()
        assert snap.datasets.tsunami.status != DatasetStatus.ok

    @pytest.mark.asyncio
    async def test_津波が全部予報なら正当な0件でok(self, services):
        p2p, tsunami, volcano, router = services
        forecast = dict(TSUNAMI_ADVISORY, kind=[{"code": "100", "kind": "津波予報（若干の海面変動）"}])
        router.routes["/tsunami/data/list.json"] = [forecast]
        snap = await SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock()).build()
        assert snap.datasets.tsunami.status == DatasetStatus.ok
        assert snap.datasets.tsunami.items == []

    @pytest.mark.asyncio
    async def test_噴火のレコードが全部読めなければokにしない(self, services):
        p2p, tsunami, volcano, router = services
        router.routes["/volcano/data/warning.json"] = [{"volcanoInfo": "改名された形"}, "壊れた要素"]
        snap = await SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock()).build()
        assert snap.datasets.volcano_warnings.status != DatasetStatus.ok

    @pytest.mark.asyncio
    async def test_噴火が全部解除なら正当な0件でok(self, services):
        p2p, tsunami, volcano, router = services
        lifted = json.loads(json.dumps(VOLCANO_WARNING))
        lifted[0]["volcanoInfos"][0]["items"][0]["condition"] = "解除"
        router.routes["/volcano/data/warning.json"] = lifted
        snap = await SnapshotBuilder(build_default_fetchers(p2p, tsunami, volcano), clock=_Clock()).build()
        assert snap.datasets.volcano_warnings.status == DatasetStatus.ok
        assert snap.datasets.volcano_warnings.items == []

    @pytest.mark.asyncio
    async def test_既存の噴火警報エンドポイント経路は従来どおり空(self, services):
        """get_volcano_warnings（既存 API 用）は全滅でも [] のまま（変えない）。"""
        _, _, volcano, router = services
        router.routes["/volcano/data/warning.json"] = [{"volcanoInfo": "改名された形"}]
        assert await volcano.get_volcano_warnings() == []
