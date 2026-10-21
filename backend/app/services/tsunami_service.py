"""
気象庁 津波情報サービス
"""
import httpx
from dataclasses import dataclass
from typing import Optional
from datetime import datetime
from ..models import TsunamiInfo
from ..utils.logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# 「発表中」の判定（共有関数）
#
# list.json の `kind` 配列の要素は **`{"code": "100", "kind": "津波注意報"}` の形で、
# `name` キーは存在しない**（2026-10-22 に実レスポンスで確認）。区域名も無くコードだけ。
# 種別名はまず**完全一致**で分類し、表に無い名前は「解除」を先に見てから部分一致で分類する
# （単純な部分一致だと「津波注意報解除」を注意報と誤認する）。手がかりの無い名前は
# "unknown" として発表中に残す（語彙が変わったときに 0 件へ潰さない）。
#
# 実データで観測できた種別は「津波予報（若干の海面変動）」のみ。警報・注意報・解除の
# 名称は気象庁 XML のコード表（警報等情報要素／津波警報・注意報・予報）に合わせた推定で、
# 実データでの観測はまだ無い。外れていれば "unknown" として表に出る。
# ---------------------------------------------------------------------------

#: 区域の津波種別 → 階級。発表中として扱うのは ACTIVE_TSUNAMI_LEVELS のみ
TSUNAMI_KIND_LEVELS: dict[str, str] = {
    "大津波警報": "major_warning",
    "大津波警報：発表": "major_warning",
    "津波警報": "warning",
    "津波注意報": "advisory",
    "津波予報（若干の海面変動）": "forecast",
    "津波なし": "none",
    "警報解除": "cancelled",
    "津波注意報解除": "cancelled",
}

#: 発表中として表示する階級（重い順）
ACTIVE_TSUNAMI_LEVELS: tuple[str, ...] = ("major_warning", "warning", "advisory")

#: 取消報の InfoType（list.json の `ift`）。取消された報は発表中にしない
CANCELLED_INFO_TYPES = frozenset({"取消"})

_LEVEL_ORDER = {level: i for i, level in enumerate(ACTIVE_TSUNAMI_LEVELS)}


#: 表に無い名前を分類する手がかり（上から順に見る）。種別名の一次資料が見つかっていないため、
#: 名前が推定と違っても**警報を見落とさない方向に倒す**（出しすぎは許容、出さないのは不可）。
#: 「解除」を最初に見るので、「津波注意報解除」を部分一致で注意報と誤認しない。
#: 「大津波警報」は「津波警報」を含むので、必ずその前に置く
TSUNAMI_KIND_FALLBACK_HINTS: tuple[tuple[str, str], ...] = (
    ("解除", "cancelled"),
    ("大津波警報", "major_warning"),
    ("津波警報", "warning"),
    ("津波注意報", "advisory"),
    ("津波予報", "forecast"),
)


def classify_tsunami_kind(name: str) -> str:
    """区域の津波種別名を階級に分類する。

    完全一致の既知名 → 表に無い名前は TSUNAMI_KIND_FALLBACK_HINTS の順に部分一致 →
    手がかりが無ければ "unknown"（発表中として表示する側に倒す）。
    """
    known = TSUNAMI_KIND_LEVELS.get(name)
    if known is not None:
        return known
    for hint, level in TSUNAMI_KIND_FALLBACK_HINTS:
        if hint in name:
            return level
    return "unknown"


@dataclass(frozen=True)
class TsunamiAreaKind:
    """発表中（または種別不明）の 1 区域。code は津波予報区のコード（名前は list.json に無い）。"""

    code: str
    kind_ja: str
    level: str


@dataclass(frozen=True)
class ActiveTsunamiReport:
    """イベント（eid）ごとの最新報のうち、発表中の区域を持つもの。

    level は発表中の区域の最も重い階級。既知の階級が無く種別不明だけなら "unknown"。
    """

    report: dict
    level: str
    areas: tuple[TsunamiAreaKind, ...]


def _report_order_key(report: dict) -> str:
    # ctt は「YYYYMMDDHHMMSS」固定長の作成時刻なので文字列比較で時系列になる
    return str(report.get("ctt") or "")


def select_active_tsunami_reports(reports: list) -> list[ActiveTsunamiReport]:
    """list.json の生の報から、現在発表中の津波警報・注意報をイベントごとに選ぶ。

    - イベント（eid）ごとに**最新報だけ**を見る。過去報の注意報を発表中にしない
    - 最新報が取消（ift=取消）なら発表中にしない
    - 区域ごとに判定する。解除・予報・なしの区域は落とし、注意報以上と種別不明の区域を残す
      （一部区域だけ解除された報でも、残りの区域は発表中のまま）
    - 重い順に並べる
    """
    latest: dict[str, dict] = {}
    for index, report in enumerate(reports):
        if not isinstance(report, dict):
            logger.warning("津波一覧に dict でない要素がある（飛ばす）")
            continue
        event_id = str(report.get("eid") or f"__no_eid_{index}")
        current = latest.get(event_id)
        if current is None or _report_order_key(report) > _report_order_key(current):
            latest[event_id] = report

    active: list[ActiveTsunamiReport] = []
    for report in latest.values():
        if report.get("ift") in CANCELLED_INFO_TYPES:
            continue
        areas: list[TsunamiAreaKind] = []
        for entry in report.get("kind") or []:
            if not isinstance(entry, dict):
                continue
            kind_ja = str(entry.get("kind") or "")
            level = classify_tsunami_kind(kind_ja)
            if level in ACTIVE_TSUNAMI_LEVELS or level == "unknown":
                areas.append(TsunamiAreaKind(code=str(entry.get("code") or ""), kind_ja=kind_ja, level=level))
        if not areas:
            continue
        known = [a.level for a in areas if a.level in _LEVEL_ORDER]
        level = min(known, key=_LEVEL_ORDER.__getitem__) if known else "unknown"
        active.append(ActiveTsunamiReport(report=report, level=level, areas=tuple(areas)))

    # 新しい報を先に → 安定ソートで重い順（同じ階級の中は新しい順が保たれる）
    active.sort(key=lambda r: _report_order_key(r.report), reverse=True)
    active.sort(key=lambda r: _LEVEL_ORDER.get(r.level, len(_LEVEL_ORDER)))
    return active


class TsunamiService:
    """気象庁の津波情報を取得するサービス"""

    def __init__(self):
        from ..config import settings
        self.BASE_URL = settings.jma_base_url
        self.timeout = settings.api_timeout
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient()
        return self._client

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # 津波警報レベルマッピング
    TSUNAMI_LEVELS = {
        "大津波警報": "major_warning",
        "津波警報": "warning",
        "津波注意報": "advisory",
        "津波予報（若干の海面変動）": "forecast",
        "なし": "none",
    }

    async def fetch_tsunami_reports(self) -> list:
        """list.json の生の報を全件取得する。**失敗は例外で返す**（[] に潰さない）。

        Raises:
            httpx.HTTPError: 通信・HTTP ステータスの失敗
            ValueError: 本文が JSON でない、または配列でない
        """
        url = f"{self.BASE_URL}/tsunami/data/list.json"
        response = await self._get_client().get(url, timeout=self.timeout)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError(f"津波一覧が配列ではない: {type(data).__name__}")
        return data

    async def get_tsunami_list(self, limit: int = 10) -> list[TsunamiInfo]:
        """
        津波情報一覧を取得

        Args:
            limit: 取得件数

        Returns:
            list[TsunamiInfo]: 津波情報リスト
        """
        try:
            data = await self.fetch_tsunami_reports()
        except (httpx.HTTPError, ValueError) as e:
            # ValueError は response.json() のデコード失敗（HTTPError の子ではない）
            logger.error(f"津波情報取得エラー: {e}", exc_info=True)
            return []
        return self._parse_tsunami_list(data[:limit])

    def _parse_tsunami_list(self, data: list) -> list[TsunamiInfo]:
        """APIレスポンスを津波情報リストにパース"""
        tsunamis = []

        for item in data:
            try:
                # 座標情報のパース
                coordinates = item.get("cod", "")
                lat, lon = self._parse_coordinates(coordinates)

                # 警報レベルの判定
                warning_level = self._determine_warning_level(item.get("kind", []))

                tsunami = TsunamiInfo(
                    id=item.get("ctt", ""),
                    event_id=item.get("eid", ""),
                    title=item.get("ttl", ""),
                    title_en=item.get("en_ttl"),
                    report_datetime=item.get("rdt", ""),
                    earthquake_time=item.get("at"),
                    earthquake_location=item.get("anm", ""),
                    earthquake_location_en=item.get("en_anm"),
                    magnitude=item.get("mag"),
                    coordinates=coordinates,
                    warning_level=warning_level,
                    areas=item.get("kind", []),
                    message=self._generate_message(item, warning_level)
                )
                tsunamis.append(tsunami)
            except Exception as e:
                logger.error(f"津波情報パースエラー: {e}", exc_info=True)
                continue

        return tsunamis

    def _parse_coordinates(self, coord_str: str) -> tuple[Optional[float], Optional[float]]:
        """座標文字列をパース（例: +40.9+143.0-20000/）"""
        try:
            if not coord_str:
                return None, None
            # 末尾のスラッシュを除去
            coord_str = coord_str.rstrip("/")
            # 深さ情報を除去
            parts = coord_str.split("-")
            if len(parts) >= 2:
                coord_str = parts[0]

            # 緯度・経度を抽出
            lat = None
            lon = None
            if "+" in coord_str:
                segments = coord_str.split("+")
                if len(segments) >= 3:
                    lat = float(segments[1])
                    lon = float(segments[2])
            return lat, lon
        except Exception:
            return None, None

    def _determine_warning_level(self, kind_list: list) -> str:
        """1 報の中で最も重い階級（履歴一覧用）。

        区域の種別は `kind` キーにある（`name` キーは実データに存在しない）。
        完全一致で分類し、解除（例「津波注意報解除」）を注意報にしない。
        既知の発表中が無く未知の種別があれば "unknown"、何も無ければ "none"。
        """
        levels = [
            classify_tsunami_kind(str(entry.get("kind") or ""))
            for entry in kind_list or []
            if isinstance(entry, dict)
        ]
        known = [level for level in levels if level in _LEVEL_ORDER]
        if known:
            return min(known, key=_LEVEL_ORDER.__getitem__)
        return "unknown" if "unknown" in levels else "none"

    def _generate_message(self, item: dict, warning_level: str) -> str:
        """津波情報メッセージを生成する。文面は **階級で**決める。

        title（ttl）は「津波警報・注意報・予報」のように全種別を並べた名前のことがあり、
        部分一致で決めると注意報や予報にまで「直ちに高台へ避難」を出してしまう。
        """
        location = item.get("anm", "不明")
        magnitude = item.get("mag", "不明")
        title = item.get("ttl", "")

        if warning_level in ("major_warning", "warning"):
            return f"【{title}】{location}でマグニチュード{magnitude}の地震が発生しました。直ちに高台へ避難してください。"
        elif warning_level == "advisory":
            return f"【{title}】{location}でマグニチュード{magnitude}の地震が発生しました。海岸から離れてください。"
        else:
            return f"【津波情報】{location}でマグニチュード{magnitude}の地震が発生しました。{title}"

    async def fetch_active_warnings(self) -> list[TsunamiInfo]:
        """現在発表中の津波警報・注意報。**取得失敗は例外で返す**（[] に潰さない）。

        判定は共有関数 select_active_tsunami_reports（イベントごとの最新報・完全一致・
        解除と取消を除く・未知の種別は "unknown" で残す）。areas は発表中の区域だけ。

        Raises:
            httpx.HTTPError / ValueError: fetch_tsunami_reports と同じ
        """
        reports = await self.fetch_tsunami_reports()
        result: list[TsunamiInfo] = []
        for active in select_active_tsunami_reports(reports):
            parsed = self._parse_tsunami_list([active.report])
            if not parsed:
                continue
            info = parsed[0]
            info.warning_level = active.level
            info.areas = [
                {"code": area.code, "kind": area.kind_ja, "level": area.level} for area in active.areas
            ]
            info.message = self._generate_message(active.report, active.level)
            result.append(info)
        return result

    async def get_active_warnings(self) -> list[TsunamiInfo]:
        """現在発表中の津波警報・注意報。取得に失敗したら [] を返す（従来の契約）。

        「失敗」と「0 件」を区別したい呼び出し元（SSE の差分配信など）は
        fetch_active_warnings を使うこと。
        """
        try:
            return await self.fetch_active_warnings()
        except (httpx.HTTPError, ValueError) as e:
            logger.error(f"津波警報取得エラー: {e}", exc_info=True)
            return []

    async def get_tsunami_detail(self, json_filename: str) -> Optional[dict]:
        """
        津波情報の詳細を取得

        Args:
            json_filename: 詳細JSONファイル名

        Returns:
            dict: 詳細情報
        """
        url = f"{self.BASE_URL}/tsunami/data/{json_filename}"

        client = self._get_client()
        try:
            response = await client.get(url, timeout=self.timeout)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error(f"津波詳細情報取得エラー: {e}", exc_info=True)
            return None
