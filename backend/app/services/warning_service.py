"""
気象庁 警報・注意報サービス（多言語対応）

多言語対応方式:
16言語すべてを静的マッピングで組み立てる（AI・ネットワークに依存しない）。
地名は area_display、警報名・説明文は warning_names、行動指示は warning_guidance。
"""
import asyncio
import httpx
from typing import Optional
from datetime import datetime
from ..models import ALLOWED_LANGUAGES, DisasterAlert
from ..utils.logger import get_logger
from ..utils.area_codes import AREA_CODES, get_area_code
from .area_display import is_known_area, resolve_area_name
from .warning_guidance import resolve_guidance
from .warning_names import (
    DESCRIPTION_TEMPLATES as WARNING_DESCRIPTION_TEMPLATES,
    WARNING_NAMES,
)

logger = get_logger(__name__)

# 静的マッピングで対応している言語 = アプリが受け付ける全言語。
#
# 以前はここが6言語（ja/en/zh/ko/vi/easy_ja）しか無く、残る10言語は AI 経路
# （`_parse_warnings_with_ai`）に流れていた。その結果:
#   - 警報名が AI 不在時に英語固定になり、16言語化した `WARNING_NAMES` が使われない
#   - 行動指示も 16言語の `resolve_guidance` を通らない
#   - 地域名が空文字になる（AI 経路には都道府県フォールバックすら無かった）
# 警報名・説明文・行動指示・地名がすべて16言語そろった今、AI に投げる理由はない。
# 静的なら停電・低回線・APIキー未設定でも同じ結果が出る（docs の R2）。
STATIC_LANGUAGES = ALLOWED_LANGUAGES

# 「今その警報が出ている」とみなすステータス。
#
# 気象庁は最初に出したときだけ "発表" を入れ、その後の定時更新では "継続" に変わる。
# 以前は "発表" だけを通していたため、**発表直後の一瞬しか警報が表示されず、
# 継続中の警報はすべて消えていた**。実測（2026-08-01 沖縄 471000）では
# 継続 62 件・解除 29 件・発表 0 件で、有効な注意報がありながら表示はゼロだった。
#
# 解除済み（"解除"）と、警報が無いとき（"発表警報・注意報はなし"）は当然除外する。
ACTIVE_WARNING_STATUSES = frozenset({"発表", "継続"})


class WarningService:
    """気象庁の警報・注意報を取得するサービス"""

    def __init__(self, translator=None):
        from ..config import settings
        self.BASE_URL = settings.jma_base_url
        self.timeout = settings.api_timeout
        self._translator = translator  # TranslatorServiceへの参照（遅延初期化）
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient()
        return self._client

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    @property
    def translator(self):
        """TranslatorServiceを遅延初期化で取得"""
        if self._translator is None:
            from .translator import TranslatorService
            self._translator = TranslatorService()
        return self._translator

    # 警報・注意報コードマッピング（16言語）
    # 実体は warning_names.py（災害種別 × 警報レベル の合成で生成）。
    # 移行前の6言語の文面は tests/test_warning_names.py で全件突合して保証している。
    WARNING_CODES = WARNING_NAMES

    # 地域名翻訳
    # 地域名は `area_display` がコードから解決する。
    # 旧 `AREA_TRANSLATIONS`（日本語名をキーにした4地域×5言語）は、警報 JSON に
    # `name` が入っていないため一度も引かれていなかった。訳自体は
    # `area_display.AREA_NAME_OVERRIDES` にコード起点で移設済み。

    # 説明文テンプレート（16言語）— 実体は warning_names.py
    DESCRIPTION_TEMPLATES = WARNING_DESCRIPTION_TEMPLATES


    # 気象庁定義に基づく注意事項（警報コード別）
    WARNING_GUIDANCE = {
        "02": {"ja": "猛吹雪による交通障害、視界不良に警戒。外出を控え、車の運転は極力避けてください。", "en": "Beware of traffic disruption and poor visibility from blizzard. Stay indoors and avoid driving."},
        "03": {"ja": "土砂災害、浸水、河川増水に警戒。崖や川の近くから離れ、早めの避難を。", "en": "Risk of landslides, flooding, and river overflow. Stay away from slopes and rivers. Evacuate early."},
        "04": {"ja": "河川の増水や氾濫に警戒。河川敷や低地から離れてください。", "en": "Risk of river flooding and overflow. Stay away from riverbanks and low-lying areas."},
        "05": {"ja": "暴風による飛来物、建物損壊に警戒。不要な外出を避け、頑丈な建物内に。", "en": "Risk of flying debris and building damage. Stay indoors in a sturdy building."},
        "06": {"ja": "大雪による交通障害、建物倒壊に警戒。除雪時の事故にも注意。", "en": "Risk of traffic disruption and building collapse from heavy snow. Be careful when removing snow."},
        "07": {"ja": "高波による沿岸施設被害、海岸浸食に警戒。海岸に近づかないでください。", "en": "Risk of coastal damage from high waves. Stay away from the coast."},
        "08": {"ja": "高潮による浸水に警戒。沿岸低地から離れ、早めの避難を。", "en": "Risk of flooding from storm surge. Evacuate from low-lying coastal areas early."},
        "10": {"ja": "土砂災害や浸水に注意。崖や水路の近くでは特に注意してください。", "en": "Watch for landslides and flooding. Be especially careful near slopes and waterways."},
        "12": {"ja": "大雪による交通障害に注意。路面凍結、スリップ事故に気をつけて。", "en": "Watch for traffic disruption from snow. Be careful of icy roads and slipping."},
        "13": {"ja": "吹雪による視界不良に注意。車の運転時は速度を落としてください。", "en": "Watch for poor visibility from blowing snow. Reduce speed when driving."},
        "14": {"ja": "落雷、突風、急な強い雨、降ひょうに注意。屋外では建物内に避難を。", "en": "Watch for lightning, gusts, sudden heavy rain, and hail. Seek shelter indoors if outside."},
        "15": {"ja": "強風による飛来物に注意。看板やトタン屋根の固定を確認してください。", "en": "Watch for flying objects from strong winds. Secure loose items and check signage."},
        "16": {"ja": "高波に注意。海岸での釣りやレジャーは控えてください。", "en": "Watch for high waves. Avoid fishing and leisure activities on the coast."},
        "17": {"ja": "融雪による土砂災害、浸水に注意。雪崩にも警戒してください。", "en": "Watch for landslides and flooding from snowmelt. Also beware of avalanches."},
        "18": {"ja": "河川の増水に注意。河川敷や低地での活動を控えてください。", "en": "Watch for rising river levels. Avoid activities on riverbanks and in low-lying areas."},
        "19": {"ja": "高潮に注意。満潮時刻前後は特に注意してください。", "en": "Watch for storm surge. Be especially careful around high tide."},
        "20": {"ja": "濃霧による交通障害に注意。車は速度を落とし、フォグランプを使用してください。", "en": "Watch for traffic disruption from fog. Reduce speed and use fog lights."},
        "21": {"ja": "空気の乾燥による火災に注意。火の取り扱いに十分注意してください。", "en": "Watch for fire risk due to dry air. Handle fire with extra caution."},
        "22": {"ja": "なだれに注意。急斜面やなだれ危険箇所に近づかないでください。", "en": "Watch for avalanches. Stay away from steep slopes and avalanche-prone areas."},
        "23": {"ja": "低温による農作物被害、水道管凍結に注意。防寒対策をしてください。", "en": "Watch for crop damage and frozen pipes from low temperatures. Take cold-weather precautions."},
        "24": {"ja": "霜による農作物被害に注意。農業関係者は対策を。", "en": "Watch for crop damage from frost. Farmers should take protective measures."},
        "25": {"ja": "着氷による送電線や船舶への被害に注意。", "en": "Watch for damage to power lines and vessels from icing."},
        "26": {"ja": "着雪による送電線被害、交通障害に注意。", "en": "Watch for power line damage and traffic disruption from snow accretion."},
        "32": {"ja": "数十年に一度の猛吹雪。命に関わる危険。ただちに頑丈な建物に避難してください。", "en": "Once-in-decades blizzard. Life-threatening danger. Seek shelter immediately."},
        "33": {"ja": "数十年に一度の大雨。重大な災害の危険。ただちに命を守る行動をとってください。", "en": "Once-in-decades heavy rain. Serious disaster risk. Take immediate life-saving action."},
        "35": {"ja": "数十年に一度の暴風。命に関わる危険。ただちに頑丈な建物に避難してください。", "en": "Once-in-decades storm. Life-threatening danger. Seek shelter immediately."},
        "36": {"ja": "数十年に一度の大雪。重大な災害の危険。外出を控え、安全を確保してください。", "en": "Once-in-decades heavy snow. Serious disaster risk. Stay indoors and ensure safety."},
        "37": {"ja": "数十年に一度の高波。命に関わる危険。沿岸部からただちに離れてください。", "en": "Once-in-decades high waves. Life-threatening danger. Move away from the coast immediately."},
        "38": {"ja": "数十年に一度の高潮。命に関わる危険。ただちに高い場所に避難してください。", "en": "Once-in-decades storm surge. Life-threatening danger. Evacuate to high ground immediately."},
    }

    # 都道府県コードマッピング（共通ユーティリティから取得）
    AREA_CODES = AREA_CODES

    async def get_warnings(self, area_code: str, lang: str = "ja") -> list[DisasterAlert]:
        """
        指定地域の警報・注意報を取得

        Args:
            area_code: 地域コード（例: 130000=東京都）
            lang: 言語コード（16言語対応: ja, en, zh, zh-TW, ko, vi, th, id, ms, tl, fr, de, it, es, ne, easy_ja）

        Returns:
            list[DisasterAlert]: 警報・注意報リスト
        """
        url = f"{self.BASE_URL}/warning/data/warning/{area_code}.json"

        client = self._get_client()
        try:
            response = await client.get(url, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            # 静的マッピング対応言語の場合は従来通り
            if lang in STATIC_LANGUAGES:
                return self._parse_warnings(data, area_code, lang)

            # 未対応言語の場合はClaude APIで動的生成
            return await self._parse_warnings_with_ai(data, area_code, lang)

        except httpx.HTTPError as e:
            logger.error(f"警報情報取得エラー: {e}", exc_info=True)
            return []

    def _get_warning_name(self, code: str, lang: str) -> str:
        """警報コードから指定言語の名前を取得"""
        warning_info = self.WARNING_CODES.get(code, {})
        # 指定言語がなければ英語、それもなければ日本語
        return warning_info.get(lang, warning_info.get("en", warning_info.get("ja", "")))

    def _get_area_name(self, area_code: str, lang: str, fallback: str = "") -> str:
        """地域コードを指定言語の地名にする（実体は `area_display`）"""
        return resolve_area_name(area_code, lang, fallback)

    def _get_description(self, area_name: str, warning_name: str, lang: str) -> str:
        """説明文を指定言語で生成"""
        template = self.DESCRIPTION_TEMPLATES.get(lang, self.DESCRIPTION_TEMPLATES["en"])
        return template.format(area=area_name, warning=warning_name)

    def _parse_warnings(self, data: dict, area_code: str, lang: str = "ja") -> list[DisasterAlert]:
        """APIレスポンスを警報リストにパース（重複排除済み）"""
        report_datetime = data.get("reportDatetime", "")

        area_types = data.get("areaTypes", [])
        if not area_types:
            return []

        # 都道府県名をフォールバック用に取得 (reverse lookup: area_code -> 都道府県名)
        prefecture_name = next(
            (pref for pref, code in self.AREA_CODES.items() if code == area_code),
            area_code,
        )

        # 警報コード別にグループ化して重複排除。
        #
        # 気象庁の警報 JSON に地域名は入っておらず `code` しか無いので、地域コードを
        # 集めて `area_display` で言語別の地名に変換する。
        #
        # `areaTypes` は2階層ある（[0]=一次細分区域6桁 / [1]=市町村7桁）。市町村は
        # 30件を読点で連ねても読めないため収録しておらず、`is_known_area` が False に
        # なって自然に除外される。実データで両階層の警報コードが一致することは確認済み。
        grouped: dict[str, list[str]] = {}  # 警報コード -> [地域コード, ...]
        announced: set[str] = set()  # 発表されている警報コード（地域が引けたかは問わない）
        for area_type in area_types:
            areas = area_type.get("areas", [])
            for area in areas:
                area_id = str(area.get("code", ""))
                warnings = area.get("warnings", [])
                for warning in warnings:
                    code = warning.get("code", "")
                    status = warning.get("status", "")
                    if status in ACTIVE_WARNING_STATUSES and code in self.WARNING_CODES:
                        announced.add(code)
                        if not is_known_area(area_id):
                            continue
                        if code not in grouped:
                            grouped[code] = []
                        if area_id not in grouped[code]:
                            grouped[code].append(area_id)

        # 細分区域が1つも引けなかった警報も必ず出す。
        # 地名の粒度は都道府県まで落ちるが、**警報そのものは絶対に落とさない**。
        for code in announced:
            grouped.setdefault(code, [])

        # グループ化された警報をアラートに変換
        alerts = []
        for code, area_ids in grouped.items():
            warning_info = self.WARNING_CODES[code]
            warning_name = self._get_warning_name(code, lang)
            title_ja = self._get_warning_name(code, "ja")
            title_translated = warning_name if lang != "ja" else None

            # 対象地域をまとめて表示。細分区域が引けなければ都道府県まで落とす。
            display_ids = area_ids or [area_code]
            combined_area_ja = "、".join(
                self._get_area_name(a, "ja", prefecture_name) for a in display_ids
            )
            combined_area = ", ".join(
                self._get_area_name(a, lang, prefecture_name) for a in display_ids
            )

            description_ja = self._get_description(combined_area_ja, title_ja, "ja")
            description_translated = self._get_description(combined_area, warning_name, lang) if lang != "ja" else None

            # 気象庁定義に基づく注意事項を付加
            # ja/en はコード別文面、他の14言語は災害グループ別の文面（warning_guidance 参照）
            guidance = self.WARNING_GUIDANCE.get(code, {})
            guidance_text = resolve_guidance(code, lang, self.WARNING_GUIDANCE)
            if guidance_text:
                description_ja += f"\n⚠ {guidance.get('ja', '')}"
                if description_translated:
                    description_translated += f"\n⚠ {guidance_text}"

            alert_id = f"{area_code}_{code}_{datetime.now().strftime('%Y%m%d')}"

            alerts.append(DisasterAlert(
                id=alert_id,
                type=self._get_alert_type(warning_info["severity"]),
                title=title_ja,
                title_translated=title_translated,
                description=description_ja,
                description_translated=description_translated,
                area=combined_area,
                issued_at=report_datetime,
                expires_at=None,
                severity=warning_info["severity"]
            ))

        # 重要度順にソート (extreme > high > medium > low)
        severity_order = {"extreme": 0, "high": 1, "medium": 2, "low": 3}
        alerts.sort(key=lambda a: severity_order.get(a.severity, 4))

        return alerts

    def _get_alert_type(self, severity: str) -> str:
        """重要度からアラートタイプを決定"""
        if severity == "extreme":
            return "special_warning"
        elif severity == "high":
            return "warning"
        elif severity == "medium":
            return "advisory"
        else:
            return "watch"

    async def _parse_warnings_with_ai(self, data: dict, area_code: str, lang: str) -> list[DisasterAlert]:
        """
        APIレスポンスを警報リストにパース（Claude API使用版）

        未対応言語（th, id, ms, tl, fr, de, it, es, ne, zh-TW）の場合に使用。
        asyncio.gather() で全警報のAI翻訳を並列実行し、N+1問題を解消。
        return_exceptions=True により各言語・各警報のエラーが独立してハンドリングされる。
        """
        report_datetime = data.get("reportDatetime", "")

        area_types = data.get("areaTypes", [])
        if not area_types:
            return []

        # 1. 警報コード別にグループ化して重複排除
        #
        # 地域名は `code` から引く。以前は `area.get("name", "")` としていたが、
        # 気象庁の警報 JSON に `name` は存在しないため **常に空文字**になり、
        # 「〜に大雨警報が発表されています」の地名が丸ごと抜けていた。
        prefecture_name = next(
            (pref for pref, code in self.AREA_CODES.items() if code == area_code),
            area_code,
        )
        grouped: dict[str, list[str]] = {}
        for area_type in area_types:
            areas = area_type.get("areas", [])
            for area in areas:
                area_id = str(area.get("code", ""))
                if not is_known_area(area_id):
                    continue
                area_name_ja = self._get_area_name(area_id, "ja", prefecture_name)
                warnings = area.get("warnings", [])
                for warning in warnings:
                    code = warning.get("code", "")
                    status = warning.get("status", "")
                    if status in ACTIVE_WARNING_STATUSES and code in self.WARNING_CODES:
                        if code not in grouped:
                            grouped[code] = []
                        if area_name_ja not in grouped[code]:
                            grouped[code].append(area_name_ja)

        # グループ化された警報のメタデータを生成
        pending_items: list[dict] = []
        for code, area_names_ja in grouped.items():
            warning_info = self.WARNING_CODES[code]
            title_ja = self._get_warning_name(code, "ja")
            severity = warning_info.get("severity", "medium")
            alert_id = f"{area_code}_{code}_{datetime.now().strftime('%Y%m%d')}"
            combined_area_ja = "、".join(area_names_ja)

            pending_items.append({
                "code": code,
                "title_ja": title_ja,
                "severity": severity,
                "alert_id": alert_id,
                "area_name_ja": combined_area_ja,
            })

        if not pending_items:
            return []

        # 2. 全警報のAI翻訳を並列実行
        async def translate_single(item: dict) -> tuple[dict, Optional[dict], Optional[str]]:
            """単一警報の翻訳タスク。(metadata, generated_or_None, area_translated_or_None) を返す。"""
            try:
                generated, area_translated = await asyncio.gather(
                    self.translator.generate_warning_text(
                        warning_name_ja=item["title_ja"],
                        target_lang=lang,
                        area_name=item["area_name_ja"],
                        severity=item["severity"],
                    ),
                    self.translator.translate_location(item["area_name_ja"], lang),
                )
                return (item, generated, area_translated)
            except Exception as e:
                logger.error(f"AI生成エラー: {e}", exc_info=True)
                return (item, None, None)

        tasks = [translate_single(item) for item in pending_items]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 3. 結果を DisasterAlert に変換
        alerts: list[DisasterAlert] = []
        for result in results:
            # gather(return_exceptions=True) により例外オブジェクトが返る可能性を処理
            if isinstance(result, BaseException):
                logger.error(f"並列翻訳で予期しないエラー: {result}", exc_info=True)
                continue

            item, generated, area_translated = result

            if generated is not None and area_translated is not None:
                alerts.append(DisasterAlert(
                    id=item["alert_id"],
                    type=self._get_alert_type(item["severity"]),
                    title=item["title_ja"],
                    title_translated=generated.get("name"),
                    description=f"{item['area_name_ja']}に{item['title_ja']}が発表されています。",
                    description_translated=generated.get("description"),
                    area=area_translated,
                    issued_at=report_datetime,
                    expires_at=None,
                    severity=item["severity"],
                    action=generated.get("action"),
                ))
            else:
                # フォールバック: 英語版を使用
                alerts.append(DisasterAlert(
                    id=item["alert_id"],
                    type=self._get_alert_type(item["severity"]),
                    title=item["title_ja"],
                    title_translated=self._get_warning_name(item["code"], "en"),
                    description=f"{item['area_name_ja']}に{item['title_ja']}が発表されています。",
                    description_translated=self._get_description(
                        item["area_name_ja"], self._get_warning_name(item["code"], "en"), "en"
                    ),
                    area=item["area_name_ja"],
                    issued_at=report_datetime,
                    expires_at=None,
                    severity=item["severity"],
                ))

        return alerts

    async def get_all_prefectures_warnings(self) -> list[DisasterAlert]:
        """
        全国の警報・注意報を取得

        Returns:
            list[DisasterAlert]: 全国の警報・注意報リスト
        """
        all_alerts = []
        semaphore = asyncio.Semaphore(10)  # 同時接続制限

        async def fetch_prefecture(client: httpx.AsyncClient, prefecture: str, area_code: str) -> list[DisasterAlert]:
            async with semaphore:
                try:
                    url = f"{self.BASE_URL}/warning/data/warning/{area_code}.json"
                    response = await client.get(url, timeout=self.timeout)
                    if response.status_code == 200:
                        data = response.json()
                        return self._parse_warnings(data, area_code)
                except httpx.HTTPError as e:
                    logger.warning(f"{prefecture}の警報取得エラー: {e}")
                return []

        client = self._get_client()
        tasks = [
            fetch_prefecture(client, prefecture, area_code)
            for prefecture, area_code in self.AREA_CODES.items()
        ]
        results = await asyncio.gather(*tasks)
        for alerts in results:
            all_alerts.extend(alerts)

        return all_alerts

    async def get_special_warnings(self) -> list[DisasterAlert]:
        """
        全国の特別警報のみを取得

        Returns:
            list[DisasterAlert]: 特別警報リスト
        """
        all_alerts = await self.get_all_prefectures_warnings()
        return [alert for alert in all_alerts if alert.severity == "extreme"]

    def get_area_code(self, prefecture_name: str) -> Optional[str]:
        """都道府県名から地域コードを取得"""
        return get_area_code(prefecture_name)
