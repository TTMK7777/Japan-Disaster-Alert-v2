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
from .location_composer import compose as compose_location
from ..utils.logger import get_logger

#: 気象庁・P2P が「未確定」を数値欄へ入れてくる番兵値。
#: p2p_service.P2PQuakeService.UNDETERMINED と同じ値でなければならない。
#: ここで p2p_service を import すると翻訳層が取得層に依存してしまうため
#: 値を持ち直し、一致は tests/test_undetermined_location.py で固定している。
UNDETERMINED = -1

logger = get_logger(__name__)


class TranslatorService:
    """ハイブリッド翻訳サービス（ファサード）"""

    def __init__(self):
        """初期化"""
        from ..config import settings

        # キャッシュ（DB永続化。起動時に await cache_init() が必要）
        self._cache = TranslationCache()

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

    async def cache_init(self) -> None:
        """翻訳キャッシュをDBから復元する（起動時に呼び出す）"""
        await self._cache.init()

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

        # 1. 静的マッピングを試行（手で訳した 82 件。常にこれが最優先）
        static_translation = get_location_translation(location, target_lang)
        if static_translation:
            return static_translation

        # 1.5 形態から組み立てる。
        # 静的辞書は完全名の丸暗記なので、気象庁の震源地名 400 種余りに対して
        # ユニークベースで 44.8% が未収録だった（実データ 317 レポートで実測）。
        # 決定的で費用もかからないので、キャッシュや AI より先に試す。
        composed = compose_location(location, target_lang)
        if composed:
            return composed

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
                    await self._cache.set(cache_key, translated)
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

        # キャッシュを確認（AIプロバイダー未設定でもDB復元済みキャッシュは使える）
        cache_key = self._cache.make_key(text, target_lang)
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        # AI APIで翻訳
        provider = self._ai.get_active_provider()
        if provider:
            try:
                translated = await self._ai.translate_text(text, target_lang)
                if translated:
                    await self._cache.set(cache_key, translated)
                    return translated
            except Exception as e:
                logger.error(f"翻訳エラー ({provider}): {e}", exc_info=True)

        # フォールバック
        return text

    def _try_template_translation(self, text: str, target_lang: str) -> Optional[str]:
        """
        テンプレートを使用した翻訳を試行

        日本語テンプレートと完全一致する定型文のみテンプレート翻訳を返す。
        旧実装のキーワード部分一致は「大雨警報」が津波警報テンプレートに
        誤マッチする等の誤訳や、プレースホルダー未展開文字列の返却を
        引き起こすため廃止した。

        Args:
            text: 翻訳するテキスト
            target_lang: 翻訳先言語

        Returns:
            翻訳されたテキスト（テンプレートが見つからない場合はNone）
        """
        for _template_key, translations in TEMPLATES.items():
            ja_template = translations.get("ja", "")
            # プレースホルダーを含むテンプレートは完全一致し得ないためスキップ
            if not ja_template or "{" in ja_template:
                continue
            if text == ja_template:
                return translations.get(target_lang)

        return None

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
        location_pending: bool = False,
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
            location_pending: 震源地が未確定か。翻訳済みの地名を受け取るため
                この関数からは日本語の番兵を判定できない

        Returns:
            翻訳されたメッセージ
        """
        # 断片方式。日本語版 P2PQuakeService._generate_message の分岐と 1:1 で対応する。
        # 丸ごとテンプレートに magnitude/depth を無条件で流すと、震度速報の番兵値
        # (-1) がそのまま「Magnitude -1」「Depth: -1km」として 15 言語に出る。
        #
        # headline_pending: 震源地が未確定のとき。翻訳済みの地名を受け取る都合上
        #   この関数からは日本語の番兵を判定できないので、呼び出し側が
        #   location_pending で伝える。
        # magnitude_pending: 規模が未確定のとき。震度だけは出せるので残す。
        # easy_ja はマグニチュードという概念自体を出さない方針なので、
        #   magnitude と magnitude_pending が同じ文になる（意図的）。
        fragments = {
            "en": {
                "headline": "[Earthquake] An earthquake occurred in {location}. ",
                "headline_pending": "[Earthquake] An earthquake occurred. The epicenter is being determined. ",
                "magnitude": "Magnitude {magnitude}, maximum intensity {intensity}. ",
                "magnitude_pending": "Maximum intensity {intensity}. The magnitude is being determined. ",
                "depth": "Depth: about {depth}km. ",
            },
            "zh": {
                "headline": "【地震信息】{location}发生地震。",
                "headline_pending": "【地震信息】发生地震。震源位置正在调查中。",
                "magnitude": "震级{magnitude}，最大震度{intensity}。",
                "magnitude_pending": "最大震度{intensity}。震级正在调查中。",
                "depth": "震源深度约{depth}公里。",
            },
            "zh-TW": {
                "headline": "【地震資訊】{location}發生地震。",
                "headline_pending": "【地震資訊】發生地震。震源位置調查中。",
                "magnitude": "規模{magnitude}，最大震度{intensity}。",
                "magnitude_pending": "最大震度{intensity}。規模調查中。",
                "depth": "震源深度約{depth}公里。",
            },
            "ko": {
                "headline": "【지진정보】{location}에서 지진이 발생했습니다. ",
                "headline_pending": "【지진정보】지진이 발생했습니다. 진앙은 현재 조사 중입니다. ",
                "magnitude": "규모 {magnitude}, 최대진도 {intensity}. ",
                "magnitude_pending": "최대진도 {intensity}. 규모는 현재 조사 중입니다. ",
                "depth": "진원 깊이 약 {depth}km. ",
            },
            "vi": {
                "headline": "[Động đất] Động đất xảy ra tại {location}. ",
                "headline_pending": "[Động đất] Đã xảy ra động đất. Tâm chấn đang được xác định. ",
                "magnitude": "Cường độ {magnitude}, cường độ tối đa {intensity}. ",
                "magnitude_pending": "Cường độ tối đa {intensity}. Cường độ đang được xác định. ",
                "depth": "Độ sâu: khoảng {depth}km. ",
            },
            "th": {
                "headline": "[แผ่นดินไหว] เกิดแผ่นดินไหวที่ {location} ",
                "headline_pending": "[แผ่นดินไหว] เกิดแผ่นดินไหว กำลังตรวจสอบตำแหน่งศูนย์กลาง ",
                "magnitude": "ขนาด {magnitude} ความรุนแรงสูงสุด {intensity} ",
                "magnitude_pending": "ความรุนแรงสูงสุด {intensity} กำลังตรวจสอบขนาด ",
                "depth": "ความลึก: ประมาณ {depth} กม. ",
            },
            "id": {
                "headline": "[Gempa] Gempa bumi terjadi di {location}. ",
                "headline_pending": "[Gempa] Terjadi gempa bumi. Pusat gempa sedang ditentukan. ",
                "magnitude": "Magnitudo {magnitude}, intensitas maksimum {intensity}. ",
                "magnitude_pending": "Intensitas maksimum {intensity}. Magnitudo sedang ditentukan. ",
                "depth": "Kedalaman: sekitar {depth}km. ",
            },
            "ms": {
                "headline": "[Gempa Bumi] Gempa bumi berlaku di {location}. ",
                "headline_pending": "[Gempa Bumi] Gempa bumi telah berlaku. Pusat gempa sedang ditentukan. ",
                "magnitude": "Magnitud {magnitude}, keamatan maksimum {intensity}. ",
                "magnitude_pending": "Keamatan maksimum {intensity}. Magnitud sedang ditentukan. ",
                "depth": "Kedalaman: kira-kira {depth}km. ",
            },
            "tl": {
                "headline": "[Lindol] Nagkaroon ng lindol sa {location}. ",
                "headline_pending": "[Lindol] Nagkaroon ng lindol. Tinutukoy pa ang sentro nito. ",
                "magnitude": "Magnitude {magnitude}, pinakamataas na intensity {intensity}. ",
                "magnitude_pending": "Pinakamataas na intensity {intensity}. Tinutukoy pa ang magnitude. ",
                "depth": "Lalim: humigit-kumulang {depth}km. ",
            },
            "fr": {
                "headline": "[Séisme] Un séisme s'est produit à {location}. ",
                "headline_pending": "[Séisme] Un séisme s'est produit. L'épicentre est en cours de détermination. ",
                "magnitude": "Magnitude {magnitude}, intensité maximale {intensity}. ",
                "magnitude_pending": "Intensité maximale {intensity}. La magnitude est en cours de détermination. ",
                "depth": "Profondeur : environ {depth} km. ",
            },
            "de": {
                "headline": "[Erdbeben] Ein Erdbeben ereignete sich in {location}. ",
                "headline_pending": "[Erdbeben] Ein Erdbeben hat sich ereignet. Das Epizentrum wird noch ermittelt. ",
                "magnitude": "Magnitude {magnitude}, maximale Intensität {intensity}. ",
                "magnitude_pending": "Maximale Intensität {intensity}. Die Magnitude wird noch ermittelt. ",
                "depth": "Tiefe: etwa {depth} km. ",
            },
            "it": {
                "headline": "[Terremoto] Si è verificato un terremoto a {location}. ",
                "headline_pending": "[Terremoto] Si è verificato un terremoto. L'epicentro è in corso di determinazione. ",
                "magnitude": "Magnitudo {magnitude}, intensità massima {intensity}. ",
                "magnitude_pending": "Intensità massima {intensity}. La magnitudo è in corso di determinazione. ",
                "depth": "Profondità: circa {depth} km. ",
            },
            "es": {
                "headline": "[Terremoto] Ocurrió un terremoto en {location}. ",
                "headline_pending": "[Terremoto] Ocurrió un terremoto. El epicentro se está determinando. ",
                "magnitude": "Magnitud {magnitude}, intensidad máxima {intensity}. ",
                "magnitude_pending": "Intensidad máxima {intensity}. La magnitud se está determinando. ",
                "depth": "Profundidad: unos {depth} km. ",
            },
            "ne": {
                "headline": "[भूकम्प] {location} मा भूकम्प आयो। ",
                "headline_pending": "[भूकम्प] भूकम्प आयो। भूकम्पको केन्द्रबिन्दु पत्ता लगाइँदै छ। ",
                "magnitude": "म्याग्निच्युड {magnitude}, अधिकतम तीव्रता {intensity}। ",
                "magnitude_pending": "अधिकतम तीव्रता {intensity}। म्याग्निच्युड पत्ता लगाइँदै छ। ",
                "depth": "गहिराई: लगभग {depth} किमी। ",
            },
            "easy_ja": {
                "headline": "【じしん】{location}で じしんが ありました。",
                "headline_pending": "【じしん】じしんが ありました。どこで おきたか いま しらべて います。",
                "magnitude": "つよさは {intensity} です。",
                "magnitude_pending": "つよさは {intensity} です。",
                "depth": "ふかさは やく {depth}キロメートル。",
            },
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

        parts = fragments.get(lang, fragments["en"])
        tsunami_template = tsunami_templates.get(lang, tsunami_templates["en"])

        # 津波情報の生成
        if tsunami_warning in ["なし", "None"]:
            tsunami_info = tsunami_template["safe"]
        else:
            tsunami_info = tsunami_template["warning"].format(warning=tsunami_warning_translated)

        if location_pending or not str(location).strip():
            message = parts["headline_pending"]
        else:
            message = parts["headline"].format(location=location)

        if magnitude > UNDETERMINED:
            message += parts["magnitude"].format(magnitude=magnitude, intensity=intensity)
        else:
            message += parts["magnitude_pending"].format(intensity=intensity)

        if depth > UNDETERMINED:
            message += parts["depth"].format(depth=depth)

        return message + tsunami_info

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
                    await self._cache.set(cache_key, json.dumps(warning_result, ensure_ascii=False))
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
    # リソース管理
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """保持しているリソースを解放する（HTTPクライアント等）"""
        await self._ai.close()

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
