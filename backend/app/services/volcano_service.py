"""
気象庁 火山情報サービス
"""
import asyncio
import time

import httpx
from typing import Optional
from ..models import VolcanoInfo, VolcanoWarning
from .volcano_levels import (
    CONTINUING_CONDITIONS,
    LIFTED_CONDITIONS,
    WARNING_TYPES,
    level_severity,
)
from ..utils.logger import get_logger

logger = get_logger(__name__)


class VolcanoService:
    """気象庁の火山情報を取得するサービス"""

    def __init__(self):
        from ..config import settings
        self.BASE_URL = f"{settings.jma_base_url}/volcano"
        self.timeout = settings.api_timeout
        self._client: Optional[httpx.AsyncClient] = None
        #: path -> (monotonic 時刻, 生の JSON)。詳細は _fetch_json の docstring
        self._json_cache: dict = {}

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient()
        return self._client

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    #: 火山カタログ（const/volcano_list.json）の TTL。内容は年単位でしか変わらない
    LIST_TTL_SECONDS = 6 * 60 * 60
    #: 発表中の警報（data/warning.json）の TTL。フロントは 15 分間隔でポーリングする
    WARNING_TTL_SECONDS = 5 * 60

    async def _fetch_json(self, path: str, ttl: float):
        """JMA の JSON を TTL 付きで取得する。

        キャッシュするのは**生の JSON**（dict / list）だけで、モデルオブジェクトは
        呼び出しごとに組み立て直す。パース済みオブジェクトをキャッシュすると、
        エンドポイントが言語別に書き換えた結果が次のリクエストへ漏れる。
        生 JSON は全経路が読み取り専用（.get のみ）なので共有してよい。

        取得に失敗したときは**期限切れでも直近の成功値を返す**。災害情報アプリでは
        「発表時刻つきの少し古い警報」の方が「何も出ない画面」よりはるかにましで、
        sw.js のタイルキャッシュ（圏外時は期限切れでも返す）と同じ判断。

        同時リクエストで二重取得になりうるが、後勝ちで上書きされるだけなので
        ロックは持たない（正しさに影響しない・コードが単純に保てる）。
        """
        now = time.monotonic()
        cached = self._json_cache.get(path)
        if cached is not None and now - cached[0] < ttl:
            return cached[1]

        url = f"{self.BASE_URL}/{path}"
        client = self._get_client()
        try:
            response = await client.get(url, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as e:
            # ValueError は response.json() のデコード失敗（json.JSONDecodeError は
            # ValueError のサブクラス）。httpx.HTTPError では捕捉できず、
            # 素通しすると API 全体が 500 になる
            logger.error(f"JMA JSON 取得エラー ({path}): {e}", exc_info=True)
            return cached[1] if cached is not None else None

        self._json_cache[path] = (now, data)
        return data

    # 噴火警戒レベルの説明
    ALERT_LEVELS = {
        1: {"name": "活火山であることに留意", "severity": "low", "action": "火口内立入規制"},
        2: {"name": "火口周辺規制", "severity": "medium", "action": "火口周辺への立入規制"},
        3: {"name": "入山規制", "severity": "high", "action": "登山禁止・入山規制"},
        4: {"name": "高齢者等避難", "severity": "high", "action": "警戒が必要な居住地域での高齢者等の避難準備"},
        5: {"name": "避難", "severity": "extreme", "action": "危険な居住地域からの避難"},
    }

    # 従来ここに火山コードの手書きリストがあったが、`volcano_list.json` の code は
    # **文字列**なので `code in [314, 312, ...]` は常に False で、一度も効いていなかった。
    # 常時観測火山かどうかは元データの `levelOperation` が持っているのでそれを使う。

    async def get_volcano_list(self) -> list[VolcanoInfo]:
        """
        火山一覧を取得

        Returns:
            list[VolcanoInfo]: 火山情報リスト
        """
        data = await self._fetch_json("const/volcano_list.json", self.LIST_TTL_SECONDS)
        if data is None:
            return []
        return self._parse_volcano_list(data)

    def _parse_volcano_list(self, data: list) -> list[VolcanoInfo]:
        """APIレスポンスを火山情報リストにパース"""
        volcanoes = []

        for item in data:
            try:
                code = str(item.get("code", "")).strip()
                latlon = item.get("latlon", [None, None])
                lat = latlon[0] if len(latlon) > 0 else None
                lon = latlon[1] if len(latlon) > 1 else None

                volcano = VolcanoInfo(
                    code=code,
                    name=item.get("name_jp", ""),
                    name_en=item.get("name_en"),
                    latitude=lat,
                    longitude=lon,
                    # 噴火警戒レベルが運用されている火山（元データで 120 件中 53 件）
                    is_monitored=bool(item.get("levelOperation", False)),
                )
                volcanoes.append(volcano)
            except Exception as e:
                logger.error(f"火山情報パースエラー: {e}", exc_info=True)
                continue

        return volcanoes

    async def get_monitored_volcanoes(self) -> list[VolcanoInfo]:
        """
        常時観測火山のみを取得

        Returns:
            list[VolcanoInfo]: 常時観測火山リスト
        """
        all_volcanoes = await self.get_volcano_list()
        return [v for v in all_volcanoes if v.is_monitored]

    async def get_volcano_warnings(self) -> list[VolcanoWarning]:
        """発表中の噴火警報をすべて取得する。

        気象庁は `data/warning.json` の 1 本に全ての発表中の警報をまとめている。
        火山ごとに URL を組み立てる必要はない（そもそもその形の URL は存在しない）。
        """
        data = await self._fetch_json("data/warning.json", self.WARNING_TTL_SECONDS)
        if data is None:
            return []

        catalogue = {v.code: v for v in await self.get_volcano_list()}
        warnings: list[VolcanoWarning] = []
        for record in data:
            warnings.extend(self._parse_warning_record(record, catalogue))
        # 危険な方から並べる
        order = {"extreme": 0, "high": 1, "advisory": 2}
        warnings.sort(key=lambda w: (order.get(w.severity, 3), -(w.alert_level or 0)))
        return warnings

    #: 対象の火山そのものを表す volcanoInfos の type。
    #: ほかに「対象市町村等」「対象市町村の防災対応等」があり、混ぜると
    #: 市町村名が火山名の位置に入る
    VOLCANO_INFO_TYPE = "噴火警報・予報（対象火山）"
    MUNICIPALITY_INFO_TYPE = "噴火警報・予報（対象市町村等）"

    def _parse_warning_record(
        self, record: dict, catalogue: dict[str, VolcanoInfo]
    ) -> list[VolcanoWarning]:
        """warning.json の 1 レコードを火山ごとの警報に開く。"""
        try:
            issued_at = record.get("reportDatetime", "")
            municipalities = self._extract_municipalities(record)

            results: list[VolcanoWarning] = []
            for info in record.get("volcanoInfos", []):
                if info.get("type") != self.VOLCANO_INFO_TYPE:
                    continue
                for item in info.get("items", []):
                    condition = item.get("condition", "")
                    # 解除された警報を画面に出さない。
                    # 気象庁の condition は 発表 / 継続 / 切替 / 引上げ / 引下げ / 解除
                    if condition in LIFTED_CONDITIONS:
                        continue
                    name_ja = item.get("name", "")
                    for area in item.get("areas", []):
                        warning = self._build_warning(
                            area=area,
                            name_ja=name_ja,
                            condition=condition,
                            issued_at=issued_at,
                            municipalities=municipalities,
                            catalogue=catalogue,
                        )
                        if warning is not None:
                            results.append(warning)
            return results
        except Exception as e:
            logger.error(f"火山警報パースエラー: {e}", exc_info=True)
            return []

    def _extract_municipalities(self, record: dict) -> list[str]:
        names: list[str] = []
        for info in record.get("volcanoInfos", []):
            if info.get("type") != self.MUNICIPALITY_INFO_TYPE:
                continue
            for item in info.get("items", []):
                for area in item.get("areas", []):
                    name = area.get("name")
                    if name and name not in names:
                        names.append(name)
        return names

    def _build_warning(
        self,
        *,
        area: dict,
        name_ja: str,
        condition: str,
        issued_at: str,
        municipalities: list[str],
        catalogue: dict[str, VolcanoInfo],
    ) -> Optional[VolcanoWarning]:
        code = str(area.get("code", "")).strip()
        volcano_name = area.get("name") or ""
        if not code and not volcano_name:
            return None

        known = catalogue.get(code)
        level = extract_level(name_ja)
        severity = level_severity(level) or warning_type_severity(name_ja)

        return VolcanoWarning(
            volcano_code=code,
            volcano_name=volcano_name or (known.name if known else code),
            volcano_name_en=known.name_en if known else None,
            latitude=known.latitude if known else None,
            longitude=known.longitude if known else None,
            alert_level=level,
            # 訳は API 層で言語ごとに入れ直す。ここでは日本語を置いておく
            alert_level_name=name_ja,
            severity=severity,
            warning_name_ja=name_ja,
            condition=condition,
            is_continuing=condition in CONTINUING_CONDITIONS,
            issued_at=issued_at,
            municipalities=municipalities,
        )

    async def get_volcano_by_code(self, code: str) -> Optional[VolcanoInfo]:
        """
        コードで特定の火山情報を取得

        Args:
            code: 火山コード

        Returns:
            VolcanoInfo: 火山情報
        """
        all_volcanoes = await self.get_volcano_list()
        for volcano in all_volcanoes:
            if volcano.code == str(code):
                return volcano
        return None

    def get_alert_level_info(self, level: int) -> dict:
        """
        警戒レベルの詳細情報を取得

        Args:
            level: 警戒レベル（1-5）

        Returns:
            dict: レベル情報
        """
        return self.ALERT_LEVELS.get(level, {})


#: 「レベル２（火口周辺規制）」のように全角数字で書かれる。半角も一応受ける
_LEVEL_DIGITS = {
    "１": 1, "２": 2, "３": 3, "４": 4, "５": 5,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
}


def extract_level(name_ja: str) -> Optional[int]:
    """警報名から噴火警戒レベルを取り出す。レベル制でない火山では None。

    `items[].code`（12=レベル2、13=レベル3 …）でも判別できそうに見えるが、
    実データで観測できたのは 12 / 13 / 22 / 23 / 36 の 5 つだけで、
    残りの対応は推測になる。名前の「レベルN」は自己記述的で観測もできているので
    こちらを正とする。
    """
    marker = name_ja.find("レベル")
    if marker < 0:
        return None
    tail = name_ja[marker + 3: marker + 4]
    return _LEVEL_DIGITS.get(tail)


def warning_type_severity(name_ja: str) -> str:
    """レベル制でない火山の警報種別から重大度を決める。"""
    entry = WARNING_TYPES.get(name_ja)
    if entry:
        return entry["severity"]
    # 表に無い名前。噴火に関する警報である以上は軽く扱わない
    return "high"
