"""
多言語翻訳サービス（ハイブリッド方式）

翻訳優先順位:
1. 静的マッピング（地名等） - 高速・無料
2. Claude API（未知の地名） - 高品質・有料
3. キャッシュ活用 - APIコスト削減

リファクタリング後: コア翻訳ロジックのみ保持。
AI API呼び出し、キャッシュ、安全ガイド、テンプレートは各専門モジュールに委譲。
"""
import json
from typing import Optional

import httpx

from .ai_provider import AIProvider
from .safety_guide import SafetyGuideGenerator
from .translation_cache import TranslationCache
from .translation_templates import (
    DISASTER_TYPES,
    INTENSITY_TRANSLATIONS,
    LANG_NAMES,
    LANGUAGE_NAMES,
    TEMPLATES,
    TSUNAMI_TRANSLATIONS,
)
from .location_translations import get_location_translation, LOCATION_TRANSLATIONS
from ..utils.logger import get_logger

logger = get_logger(__name__)


class TranslatorService:
    """ハイブリッド翻訳サービス（ファサード）"""

    def __init__(self):
        """初期化"""
        from ..config import settings

        # キャッシュ
        self._cache = TranslationCache(settings.translation_cache_file)

        # AIプロバイダー
        self._ai = AIProvider(
            ai_provider=settings.ai_provider,
            gemini_api_key=settings.gemini_api_key,
            gemini_model=settings.gemini_model,
            anthropic_api_key=settings.anthropic_api_key,
            anthropic_model=settings.anthropic_model,
            anthropic_api_version=settings.anthropic_api_version,
            translate_timeout=httpx.Timeout(settings.ai_timeout_translate, connect=5.0),
            generate_timeout=httpx.Timeout(settings.ai_timeout_generate, connect=5.0),
        )

        # 安全ガイド生成
        self._safety_guide = SafetyGuideGenerator(self._ai, self._cache)

        self.timeout = settings.api_timeout

    # ------------------------------------------------------------------
    # 地名翻訳
    # ------------------------------------------------------------------

    async def translate_location(self, location: str, target_lang: str) -> str:
        """
        震源地名を翻訳（ハイブリッド方式）

        Args:
            location: 日本語の震源地名
            target_lang: 翻訳先言語コード

        Returns:
            翻訳された地名
        """
        if target_lang == "ja":
            return location

        # 1. 静的マッピングを試行
        static_translation = get_location_translation(location, target_lang)
        if static_translation:
            return static_translation

        # 2. キャッシュを確認
        cache_key = self._cache.make_key(location, target_lang)
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        # 3. AI APIで翻訳
        provider = self._ai.get_active_provider()
        if provider:
            try:
                translated = await self._ai.translate_text(location, target_lang)
                if translated:
                    self._cache.set(cache_key, translated)
                    return translated
            except Exception as e:
                logger.error(f"AI API翻訳エラー ({provider}): {e}", exc_info=True)

        # 4. フォールバック: 元のテキストを返す
        return location

    # ------------------------------------------------------------------
    # 津波・震度翻訳（静的マッピング）
    # ------------------------------------------------------------------

    def translate_tsunami_warning(self, warning: str, target_lang: str) -> str:
        """
        津波情報を翻訳

        Args:
            warning: 日本語の津波情報
            target_lang: 翻訳先言語コード

        Returns:
            翻訳された津波情報
        """
        if target_lang == "ja":
            return warning

        if warning in TSUNAMI_TRANSLATIONS:
            return TSUNAMI_TRANSLATIONS[warning].get(target_lang, warning)

        return warning

    def translate_intensity(self, intensity: str, target_lang: str) -> str:
        """
        震度を翻訳（静的マッピングのみ、APIコール不要）

        Args:
            intensity: 震度文字列（例: "3", "5弱", "6強"）
            target_lang: 翻訳先言語コード

        Returns:
            翻訳された震度文字列
        """
        if target_lang == "ja":
            return INTENSITY_TRANSLATIONS.get(intensity, {}).get("ja", intensity)

        return INTENSITY_TRANSLATIONS.get(intensity, {}).get(target_lang, intensity)

    # ------------------------------------------------------------------
    # 汎用翻訳
    # ------------------------------------------------------------------

    async def translate(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "ja",
    ) -> str:
        """
        テキストを翻訳

        Args:
            text: 翻訳するテキスト
            target_lang: 翻訳先言語
            source_lang: 翻訳元言語

        Returns:
            翻訳されたテキスト
        """
        if target_lang == source_lang:
            return text

        # テンプレートベースの翻訳を試行
        template_translation = self._try_template_translation(text, target_lang)
        if template_translation:
            return template_translation

        # AI APIで翻訳
        provider = self._ai.get_active_provider()
        if provider:
            cache_key = self._cache.make_key(text, target_lang)
            cached = self._cache.get(cache_key)
            if cached:
                return cached

            try:
                translated = await self._ai.translate_text(text, target_lang)
                if translated:
                    self._cache.set(cache_key, translated)
                    return translated
            except Exception as e:
                logger.error(f"翻訳エラー ({provider}): {e}", exc_info=True)

        # フォールバック
        return text

    def _try_template_translation(self, text: str, target_lang: str) -> Optional[str]:
        """
        テンプレートを使用した翻訳を試行

        Args:
            text: 翻訳するテキスト
            target_lang: 翻訳先言語

        Returns:
            翻訳されたテキスト（テンプレートが見つからない場合はNone）
        """
        for _template_key, translations in TEMPLATES.items():
            ja_template = translations.get("ja", "")
            if any(keyword in text for keyword in self._extract_keywords(ja_template)):
                if target_lang in translations:
                    return translations[target_lang]

        return None

    @staticmethod
    def _extract_keywords(template: str) -> list[str]:
        """
        テンプレートからキーワードを抽出

        Args:
            template: テンプレート文字列

        Returns:
            キーワードリスト
        """
        keywords = []
        for word in ["地震", "津波", "避難", "警報", "注意報"]:
            if word in template:
                keywords.append(word)
        return keywords

    # ------------------------------------------------------------------
    # テンプレート
    # ------------------------------------------------------------------

    def get_template(
        self,
        template_key: str,
        lang: str,
        **kwargs,
    ) -> Optional[str]:
        """
        テンプレートを取得してフォーマット

        Args:
            template_key: テンプレートキー
            lang: 言語コード
            **kwargs: テンプレートに埋め込む変数

        Returns:
            フォーマットされたテンプレート
        """
        templates = TEMPLATES.get(template_key, {})
        template = templates.get(lang) or templates.get("ja")

        if template:
            try:
                return template.format(**kwargs)
            except KeyError:
                return template

        return None

    # ------------------------------------------------------------------
    # 地震メッセージ生成
    # ------------------------------------------------------------------

    def generate_earthquake_message(
        self,
        lang: str,
        location: str,
        magnitude: float,
        intensity: str,
        depth: int,
        tsunami_warning: str,
        tsunami_warning_translated: str,
    ) -> str:
        """
        地震情報メッセージを多言語で生成

        Args:
            lang: 言語コード
            location: 翻訳済み震源地名
            magnitude: マグニチュード
            intensity: 最大震度
            depth: 震源の深さ（km）
            tsunami_warning: 津波警報（日本語）
            tsunami_warning_translated: 翻訳済み津波情報

        Returns:
            翻訳されたメッセージ
        """
        # 各言語のテンプレート（15言語対応）
        templates = {
            "en": "[Earthquake] An earthquake occurred in {location}. Magnitude {magnitude}, Maximum intensity {intensity}. Depth: {depth}km. {tsunami_info}",
            "zh": "【地震信息】{location}发生地震。震级{magnitude}，最大震度{intensity}。震源深度约{depth}公里。{tsunami_info}",
            "zh-TW": "【地震資訊】{location}發生地震。規模{magnitude}，最大震度{intensity}。震源深度約{depth}公里。{tsunami_info}",
            "ko": "【지진정보】{location}에서 지진이 발생했습니다. 규모 {magnitude}, 최대진도 {intensity}. 진원 깊이 약 {depth}km. {tsunami_info}",
            "vi": "[Động đất] Động đất xảy ra tại {location}. Cường độ {magnitude}, Cường độ tối đa {intensity}. Độ sâu: {depth}km. {tsunami_info}",
            "th": "[แผ่นดินไหว] เกิดแผ่นดินไหวที่ {location} ขนาด {magnitude} ความรุนแรงสูงสุด {intensity} ความลึก: {depth} กม. {tsunami_info}",
            "id": "[Gempa] Gempa bumi terjadi di {location}. Magnitudo {magnitude}, Intensitas maksimum {intensity}. Kedalaman: {depth}km. {tsunami_info}",
            "ms": "[Gempa Bumi] Gempa bumi berlaku di {location}. Magnitud {magnitude}, Keamatan maksimum {intensity}. Kedalaman: {depth}km. {tsunami_info}",
            "tl": "[Lindol] Nagkaroon ng lindol sa {location}. Magnitude {magnitude}, Pinakamataas na intensity {intensity}. Lalim: {depth}km. {tsunami_info}",
            "fr": "[Séisme] Un séisme s'est produit à {location}. Magnitude {magnitude}, Intensité maximale {intensity}. Profondeur: {depth}km. {tsunami_info}",
            "de": "[Erdbeben] Ein Erdbeben ereignete sich in {location}. Magnitude {magnitude}, Maximale Intensität {intensity}. Tiefe: {depth}km. {tsunami_info}",
            "it": "[Terremoto] Si è verificato un terremoto a {location}. Magnitudo {magnitude}, Intensità massima {intensity}. Profondità: {depth}km. {tsunami_info}",
            "es": "[Terremoto] Ocurrió un terremoto en {location}. Magnitud {magnitude}, Intensidad máxima {intensity}. Profundidad: {depth}km. {tsunami_info}",
            "ne": "[भूकम्प] {location} मा भूकम्प आयो। म्याग्निच्युड {magnitude}, अधिकतम तीव्रता {intensity}। गहिराई: {depth} किमी। {tsunami_info}",
            "easy_ja": "【じしん】{location}で じしんが ありました。つよさは {intensity} です。ふかさは {depth}キロメートル。{tsunami_info}",
        }

        # 津波情報のテンプレート（15言語対応）
        tsunami_templates = {
            "en": {"safe": "There is no tsunami risk from this earthquake.", "warning": "Tsunami information: {warning}."},
            "zh": {"safe": "此次地震没有海啸风险。", "warning": "海啸信息：{warning}。"},
            "zh-TW": {"safe": "此次地震沒有海嘯風險。", "warning": "海嘯資訊：{warning}。"},
            "ko": {"safe": "이 지진으로 인한 쓰나미 위험은 없습니다.", "warning": "쓰나미 정보: {warning}."},
            "vi": {"safe": "Không có nguy cơ sóng thần từ trận động đất này.", "warning": "Thông tin sóng thần: {warning}."},
            "th": {"safe": "ไม่มีความเสี่ยงจากสึนามิจากแผ่นดินไหวครั้งนี้", "warning": "ข้อมูลสึนามิ: {warning}"},
            "id": {"safe": "Tidak ada risiko tsunami dari gempa ini.", "warning": "Informasi tsunami: {warning}."},
            "ms": {"safe": "Tiada risiko tsunami daripada gempa bumi ini.", "warning": "Maklumat tsunami: {warning}."},
            "tl": {"safe": "Walang panganib ng tsunami mula sa lindol na ito.", "warning": "Impormasyon tungkol sa tsunami: {warning}."},
            "fr": {"safe": "Il n'y a pas de risque de tsunami suite à ce séisme.", "warning": "Information tsunami: {warning}."},
            "de": {"safe": "Es besteht keine Tsunami-Gefahr durch dieses Erdbeben.", "warning": "Tsunami-Information: {warning}."},
            "it": {"safe": "Non c'è rischio di tsunami da questo terremoto.", "warning": "Informazioni tsunami: {warning}."},
            "es": {"safe": "No hay riesgo de tsunami por este terremoto.", "warning": "Información de tsunami: {warning}."},
            "ne": {"safe": "यस भूकम्पबाट सुनामीको जोखिम छैन।", "warning": "सुनामी जानकारी: {warning}।"},
            "easy_ja": {"safe": "この じしんで つなみの しんぱいは ありません。", "warning": "つなみ じょうほう: {warning}。"},
        }

        template = templates.get(lang, templates["en"])
        tsunami_template = tsunami_templates.get(lang, tsunami_templates["en"])

        # 津波情報の生成
        if tsunami_warning in ["なし", "None"]:
            tsunami_info = tsunami_template["safe"]
        else:
            tsunami_info = tsunami_template["warning"].format(warning=tsunami_warning_translated)

        return template.format(
            location=location,
            magnitude=magnitude,
            intensity=intensity,
            depth=depth,
            tsunami_info=tsunami_info,
        )

    # ------------------------------------------------------------------
    # 警報テキスト生成
    # ------------------------------------------------------------------

    async def generate_warning_text(
        self,
        warning_name_ja: str,
        target_lang: str,
        area_name: Optional[str] = None,
        severity: str = "medium",
    ) -> dict[str, str]:
        """
        警報名と説明文をAI APIで動的生成

        Args:
            warning_name_ja: 日本語の警報名（例: "大雨警報"）
            target_lang: 翻訳先言語コード
            area_name: 地域名（オプション）
            severity: 重要度（low, medium, high, extreme）

        Returns:
            {"name": 翻訳された警報名, "description": 説明文, "action": 推奨行動}
        """
        if target_lang == "ja":
            return {
                "name": warning_name_ja,
                "description": (
                    f"{area_name}に{warning_name_ja}が発表されています。"
                    if area_name
                    else f"{warning_name_ja}が発表されています。"
                ),
                "action": self._get_default_action_ja(severity),
            }

        # キャッシュを確認
        cache_key = self._cache.make_key(f"warning:{warning_name_ja}:{area_name}:{severity}", target_lang)
        cached = self._cache.get(cache_key)
        if cached:
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                pass

        # AI APIで生成
        provider = self._ai.get_active_provider()
        if provider:
            try:
                prompt = self._build_warning_prompt(warning_name_ja, target_lang, area_name, severity)
                result = await self._ai.generate_json(prompt, max_tokens=500)
                if result:
                    warning_result = {
                        "name": result.get("name", warning_name_ja),
                        "description": result.get("description", ""),
                        "action": result.get("action", ""),
                    }
                    self._cache.set(cache_key, json.dumps(warning_result, ensure_ascii=False))
                    return warning_result
            except Exception as e:
                logger.error(f"警報テキスト生成エラー ({provider}): {e}", exc_info=True)

        # フォールバック: 基本的な翻訳のみ
        fallback_name = await self._ai.translate_text(warning_name_ja, target_lang) if provider else warning_name_ja
        return {
            "name": fallback_name or warning_name_ja,
            "description": "",
            "action": "",
        }

    def _build_warning_prompt(
        self,
        warning_name_ja: str,
        target_lang: str,
        area_name: Optional[str],
        severity: str,
    ) -> str:
        """警報生成用のプロンプトを構築"""
        target_name = LANG_NAMES.get(target_lang, target_lang)

        severity_context = {
            "low": "minor advisory",
            "medium": "advisory requiring attention",
            "high": "serious warning requiring caution",
            "extreme": "emergency warning requiring immediate action",
        }
        severity_desc = severity_context.get(severity, "advisory")
        area_context = f" for {area_name}" if area_name else ""

        return f"""Translate and generate disaster warning information in {target_name}.

Japanese warning name: {warning_name_ja}
Severity level: {severity_desc}
Area: {area_name or "general"}

Return ONLY a JSON object with these exact keys (no markdown, no explanation):
{{
  "name": "translated warning name",
  "description": "brief explanation of this warning type{area_context} (1 sentence)",
  "action": "recommended immediate action for people in affected area (1-2 sentences)"
}}

Important:
- Keep translations accurate and culturally appropriate
- For "easy_ja", use simple hiragana and basic vocabulary
- Action should be practical and specific to this warning type"""

    @staticmethod
    def _get_default_action_ja(severity: str) -> str:
        """日本語のデフォルト推奨行動を取得"""
        actions = {
            "low": "最新の情報に注意してください。",
            "medium": "今後の情報に注意し、必要に応じて安全な場所へ移動してください。",
            "high": "屋外での活動を控え、安全な場所で待機してください。",
            "extreme": "直ちに安全な場所へ避難してください。命を守る行動を取ってください。",
        }
        return actions.get(severity, actions["medium"])

    # ------------------------------------------------------------------
    # 安全ガイド（SafetyGuideGenerator へ委譲）
    # ------------------------------------------------------------------

    async def generate_safety_guide(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str] = None,
        severity: str = "medium",
    ) -> Optional[dict]:
        """
        災害種別に応じた安全ガイドを生成

        Args:
            disaster_type: 災害種別
            target_lang: 言語コード
            location: 地域名（オプション）
            severity: 重要度

        Returns:
            安全ガイド情報
        """
        return await self._safety_guide.generate(disaster_type, target_lang, location, severity)

    # ------------------------------------------------------------------
    # ユーティリティ
    # ------------------------------------------------------------------

    def get_supported_languages(self) -> dict:
        """サポートする言語一覧を取得"""
        return LANGUAGE_NAMES.copy()

    def get_static_location_count(self) -> int:
        """静的マッピングに登録されている地名数を取得"""
        return len(LOCATION_TRANSLATIONS)

    def get_disaster_type_name(self, disaster_type: str, lang: str) -> str:
        """災害種別の翻訳名を取得"""
        return DISASTER_TYPES.get(disaster_type, {}).get(lang, disaster_type)

    # ------------------------------------------------------------------
    # 後方互換: テスト等で使われる内部メソッドへのアクセス
    # ------------------------------------------------------------------

    def _get_cache_key(self, text: str, target_lang: str) -> str:
        """キャッシュキーを生成（後方互換）"""
        return self._cache.make_key(text, target_lang)

    async def _translate_with_ai(self, text: str, target_lang: str) -> Optional[str]:
        """AI APIで翻訳（後方互換）"""
        return await self._ai.translate_text(text, target_lang)

    def _extract_json(self, content: str) -> Optional[dict]:
        """JSON抽出（後方互換）"""
        return AIProvider.extract_json(content)
