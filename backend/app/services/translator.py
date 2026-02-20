"""
多言語翻訳サービス（ハイブリッド方式）

翻訳優先順位:
1. 静的マッピング（地名等） - 高速・無料
2. Claude API（未知の地名） - 高品質・有料
3. キャッシュ活用 - APIコスト削減
"""
from typing import Optional
import os
import json
import hashlib
from pathlib import Path

import httpx

from .location_translations import get_location_translation, LOCATION_TRANSLATIONS
from ..utils.logger import get_logger

logger = get_logger(__name__)


class TranslatorService:
    """ハイブリッド翻訳サービス"""

    # 定型文の多言語テンプレート（15言語対応）
    TEMPLATES = {
        "earthquake": {
            "ja": "【地震情報】{location}で地震がありました。マグニチュード{magnitude}、最大震度{intensity}。",
            "en": "[Earthquake] An earthquake occurred in {location}. Magnitude {magnitude}, Maximum intensity {intensity}.",
            "zh": "【地震信息】{location}发生地震。震级{magnitude}，最大震度{intensity}。",
            "zh-TW": "【地震資訊】{location}發生地震。規模{magnitude}，最大震度{intensity}。",
            "ko": "【지진정보】{location}에서 지진이 발생했습니다. 규모 {magnitude}, 최대진도 {intensity}.",
            "vi": "[Động đất] Động đất xảy ra tại {location}. Cường độ {magnitude}, Cường độ tối đa {intensity}.",
            "th": "[แผ่นดินไหว] เกิดแผ่นดินไหวที่ {location} ขนาด {magnitude} ความรุนแรงสูงสุด {intensity}",
            "id": "[Gempa] Gempa bumi terjadi di {location}. Magnitudo {magnitude}, Intensitas maksimum {intensity}.",
            "ms": "[Gempa Bumi] Gempa bumi berlaku di {location}. Magnitud {magnitude}, Keamatan maksimum {intensity}.",
            "tl": "[Lindol] Nagkaroon ng lindol sa {location}. Magnitude {magnitude}, Pinakamataas na intensity {intensity}.",
            "fr": "[Séisme] Un séisme s'est produit à {location}. Magnitude {magnitude}, Intensité maximale {intensity}.",
            "de": "[Erdbeben] Ein Erdbeben ereignete sich in {location}. Magnitude {magnitude}, Maximale Intensität {intensity}.",
            "it": "[Terremoto] Si è verificato un terremoto a {location}. Magnitudo {magnitude}, Intensità massima {intensity}.",
            "es": "[Terremoto] Ocurrió un terremoto en {location}. Magnitud {magnitude}, Intensidad máxima {intensity}.",
            "ne": "[भूकम्प] {location} मा भूकम्प आयो। म्याग्निच्युड {magnitude}, अधिकतम तीव्रता {intensity}।",
            "easy_ja": "【じしん】{location}で じしんが ありました。つよさは {intensity} です。",
        },
        "tsunami_warning": {
            "ja": "【津波警報】沿岸部の方は直ちに高台に避難してください。",
            "en": "[Tsunami Warning] Those in coastal areas should evacuate to higher ground immediately.",
            "zh": "【海啸警报】沿海地区的人员请立即撤离到高处。",
            "zh-TW": "【海嘯警報】沿海地區的民眾請立即撤離到高處。",
            "ko": "【쓰나미 경보】해안 지역에 계신 분들은 즉시 고지대로 대피하세요.",
            "vi": "[Cảnh báo sóng thần] Những người ở vùng ven biển hãy sơ tán đến nơi cao hơn ngay lập tức.",
            "th": "[เตือนภัยสึนามิ] ผู้ที่อยู่ในพื้นที่ชายฝั่งควรอพยพไปยังที่สูงทันที",
            "id": "[Peringatan Tsunami] Mereka yang berada di daerah pesisir harus segera mengungsi ke tempat yang lebih tinggi.",
            "ms": "[Amaran Tsunami] Mereka yang berada di kawasan pantai perlu berpindah ke kawasan tinggi dengan segera.",
            "tl": "[Babala ng Tsunami] Ang mga nasa baybayin ay dapat lumikas agad sa mas mataas na lugar.",
            "fr": "[Alerte Tsunami] Les personnes dans les zones côtières doivent évacuer immédiatement vers les hauteurs.",
            "de": "[Tsunami-Warnung] Personen in Küstengebieten sollten sofort auf höhergelegene Gebiete evakuieren.",
            "it": "[Allerta Tsunami] Le persone nelle zone costiere devono evacuare immediatamente verso zone più elevate.",
            "es": "[Alerta de Tsunami] Las personas en zonas costeras deben evacuar inmediatamente hacia tierras altas.",
            "ne": "[सुनामी चेतावनी] तटीय क्षेत्रमा हुनुहुनेहरू तुरुन्तै उच्च भूमिमा सर्नुहोस्।",
            "easy_ja": "【つなみ けいほう】うみの ちかくの ひとは すぐに たかい ところに にげて ください。",
        },
        "evacuation": {
            "ja": "【避難指示】{area}に避難指示が発令されました。直ちに避難してください。",
            "en": "[Evacuation Order] An evacuation order has been issued for {area}. Please evacuate immediately.",
            "zh": "【避难指示】{area}已发布避难指示。请立即避难。",
            "zh-TW": "【避難指示】{area}已發布避難指示。請立即避難。",
            "ko": "【대피 지시】{area}에 대피 지시가 발령되었습니다. 즉시 대피하세요.",
            "vi": "[Lệnh sơ tán] Lệnh sơ tán đã được ban hành cho {area}. Hãy sơ tán ngay lập tức.",
            "th": "[คำสั่งอพยพ] มีคำสั่งอพยพสำหรับ {area} กรุณาอพยพทันที",
            "id": "[Perintah Evakuasi] Perintah evakuasi telah dikeluarkan untuk {area}. Harap segera mengungsi.",
            "ms": "[Arahan Pemindahan] Arahan pemindahan telah dikeluarkan untuk {area}. Sila berpindah segera.",
            "tl": "[Utos ng Paglikas] May utos ng paglikas para sa {area}. Mangyaring lumikas agad.",
            "fr": "[Ordre d'évacuation] Un ordre d'évacuation a été émis pour {area}. Veuillez évacuer immédiatement.",
            "de": "[Evakuierungsbefehl] Für {area} wurde ein Evakuierungsbefehl erlassen. Bitte evakuieren Sie sofort.",
            "it": "[Ordine di Evacuazione] È stato emesso un ordine di evacuazione per {area}. Si prega di evacuare immediatamente.",
            "es": "[Orden de Evacuación] Se ha emitido una orden de evacuación para {area}. Por favor evacúe inmediatamente.",
            "ne": "[खाली गर्ने आदेश] {area} को लागि खाली गर्ने आदेश जारी गरिएको छ। कृपया तुरुन्तै खाली गर्नुहोस्।",
            "easy_ja": "【ひなん しじ】{area}の ひとは すぐに にげて ください。",
        },
        "no_tsunami": {
            "ja": "この地震による津波の心配はありません。",
            "en": "There is no tsunami risk from this earthquake.",
            "zh": "此次地震没有海啸风险。",
            "zh-TW": "此次地震沒有海嘯風險。",
            "ko": "이 지진으로 인한 쓰나미 위험은 없습니다.",
            "vi": "Không có nguy cơ sóng thần từ trận động đất này.",
            "th": "ไม่มีความเสี่ยงจากสึนามิจากแผ่นดินไหวครั้งนี้",
            "id": "Tidak ada risiko tsunami dari gempa ini.",
            "ms": "Tiada risiko tsunami daripada gempa bumi ini.",
            "tl": "Walang panganib ng tsunami mula sa lindol na ito.",
            "fr": "Il n'y a pas de risque de tsunami suite à ce séisme.",
            "de": "Es besteht keine Tsunami-Gefahr durch dieses Erdbeben.",
            "it": "Non c'è rischio di tsunami da questo terremoto.",
            "es": "No hay riesgo de tsunami por este terremoto.",
            "ne": "यस भूकम्पबाट सुनामीको जोखिम छैन।",
            "easy_ja": "この じしんで つなみの しんぱいは ありません。",
        },
        "shelter_info": {
            "ja": "最寄りの避難所: {shelter_name}（{distance}km）",
            "en": "Nearest shelter: {shelter_name} ({distance}km)",
            "zh": "最近的避难所: {shelter_name}（{distance}公里）",
            "zh-TW": "最近的避難所: {shelter_name}（{distance}公里）",
            "ko": "가장 가까운 대피소: {shelter_name}({distance}km)",
            "vi": "Nơi trú ẩn gần nhất: {shelter_name} ({distance}km)",
            "th": "ที่พักพิงใกล้ที่สุด: {shelter_name} ({distance} กม.)",
            "id": "Tempat pengungsian terdekat: {shelter_name} ({distance}km)",
            "ms": "Pusat pemindahan terdekat: {shelter_name} ({distance}km)",
            "tl": "Pinakamalapit na evacuation center: {shelter_name} ({distance}km)",
            "fr": "Abri le plus proche: {shelter_name} ({distance}km)",
            "de": "Nächste Notunterkunft: {shelter_name} ({distance}km)",
            "it": "Rifugio più vicino: {shelter_name} ({distance}km)",
            "es": "Refugio más cercano: {shelter_name} ({distance}km)",
            "ne": "नजिकको आश्रय: {shelter_name} ({distance} किमी)",
            "easy_ja": "ちかくの ひなんじょ: {shelter_name}（{distance}キロメートル）",
        }
    }

    # 言語名マッピング（15言語対応）
    LANGUAGE_NAMES = {
        "ja": "日本語",
        "en": "English",
        "zh": "简体中文",
        "zh-TW": "繁體中文",
        "ko": "한국어",
        "vi": "Tiếng Việt",
        "th": "ภาษาไทย",
        "id": "Bahasa Indonesia",
        "ms": "Bahasa Melayu",
        "tl": "Filipino",
        "fr": "Français",
        "de": "Deutsch",
        "it": "Italiano",
        "es": "Español",
        "ne": "नेपाली",
        "easy_ja": "やさしい日本語"
    }

    # 津波情報の翻訳（15言語対応）
    TSUNAMI_TRANSLATIONS = {
        "なし": {
            "en": "None",
            "zh": "无",
            "zh-TW": "無",
            "ko": "없음",
            "vi": "Không có",
            "th": "ไม่มี",
            "id": "Tidak ada",
            "ms": "Tiada",
            "tl": "Wala",
            "fr": "Aucun",
            "de": "Keine",
            "it": "Nessuno",
            "es": "Ninguno",
            "ne": "छैन",
            "easy_ja": "なし",
        },
        "不明": {
            "en": "Unknown",
            "zh": "不明",
            "zh-TW": "不明",
            "ko": "불명",
            "vi": "Không rõ",
            "th": "ไม่ทราบ",
            "id": "Tidak diketahui",
            "ms": "Tidak diketahui",
            "tl": "Hindi alam",
            "fr": "Inconnu",
            "de": "Unbekannt",
            "it": "Sconosciuto",
            "es": "Desconocido",
            "ne": "अज्ञात",
            "easy_ja": "わからない",
        },
        "調査中": {
            "en": "Under investigation",
            "zh": "调查中",
            "zh-TW": "調查中",
            "ko": "조사 중",
            "vi": "Đang điều tra",
            "th": "กำลังตรวจสอบ",
            "id": "Sedang diselidiki",
            "ms": "Sedang disiasat",
            "tl": "Sinisiyasat",
            "fr": "En cours d'investigation",
            "de": "Wird untersucht",
            "it": "In fase di indagine",
            "es": "En investigación",
            "ne": "अनुसन्धान गर्दै",
            "easy_ja": "しらべている",
        },
        "若干の海面変動": {
            "en": "Slight sea level change",
            "zh": "轻微海面变动",
            "zh-TW": "輕微海面變動",
            "ko": "약간의 해수면 변동",
            "vi": "Biến động mực nước biển nhẹ",
            "th": "ระดับน้ำทะเลเปลี่ยนแปลงเล็กน้อย",
            "id": "Perubahan permukaan laut sedikit",
            "ms": "Perubahan aras laut sedikit",
            "tl": "Bahagyang pagbabago sa antas ng dagat",
            "fr": "Léger changement du niveau de la mer",
            "de": "Leichte Meeresspiegeländerung",
            "it": "Leggero cambiamento del livello del mare",
            "es": "Ligero cambio en el nivel del mar",
            "ne": "समुद्र सतहमा थोरै परिवर्तन",
            "easy_ja": "うみの たかさが すこし かわる",
        },
        "津波注意報": {
            "en": "Tsunami Advisory",
            "zh": "海啸注意报",
            "zh-TW": "海嘯注意報",
            "ko": "쓰나미 주의보",
            "vi": "Cảnh báo sóng thần",
            "th": "คำเตือนสึนามิ",
            "id": "Peringatan Tsunami",
            "ms": "Nasihat Tsunami",
            "tl": "Payo sa Tsunami",
            "fr": "Avis de tsunami",
            "de": "Tsunami-Hinweis",
            "it": "Avviso tsunami",
            "es": "Aviso de tsunami",
            "ne": "सुनामी सावधानी",
            "easy_ja": "つなみ ちゅういほう",
        },
        "津波警報": {
            "en": "Tsunami Warning",
            "zh": "海啸警报",
            "zh-TW": "海嘯警報",
            "ko": "쓰나미 경보",
            "vi": "Cảnh báo sóng thần nghiêm trọng",
            "th": "เตือนภัยสึนามิ",
            "id": "Peringatan Tsunami Serius",
            "ms": "Amaran Tsunami",
            "tl": "Babala ng Tsunami",
            "fr": "Alerte tsunami",
            "de": "Tsunami-Warnung",
            "it": "Allerta tsunami",
            "es": "Alerta de tsunami",
            "ne": "सुनामी चेतावनी",
            "easy_ja": "つなみ けいほう",
        },
    }

    # 震度翻訳（JMA震度階級、10震度 x 16言語）
    INTENSITY_TRANSLATIONS = {
        "0": {
            "ja": "震度0", "en": "0", "zh": "0", "zh-TW": "0", "ko": "0",
            "vi": "0", "th": "0", "id": "0", "ms": "0", "tl": "0",
            "fr": "0", "de": "0", "it": "0", "es": "0", "ne": "0",
            "easy_ja": "しんど 0",
        },
        "1": {
            "ja": "震度1", "en": "1", "zh": "1", "zh-TW": "1", "ko": "1",
            "vi": "1", "th": "1", "id": "1", "ms": "1", "tl": "1",
            "fr": "1", "de": "1", "it": "1", "es": "1", "ne": "1",
            "easy_ja": "しんど 1",
        },
        "2": {
            "ja": "震度2", "en": "2", "zh": "2", "zh-TW": "2", "ko": "2",
            "vi": "2", "th": "2", "id": "2", "ms": "2", "tl": "2",
            "fr": "2", "de": "2", "it": "2", "es": "2", "ne": "2",
            "easy_ja": "しんど 2",
        },
        "3": {
            "ja": "震度3", "en": "3", "zh": "3", "zh-TW": "3", "ko": "3",
            "vi": "3", "th": "3", "id": "3", "ms": "3", "tl": "3",
            "fr": "3", "de": "3", "it": "3", "es": "3", "ne": "3",
            "easy_ja": "しんど 3",
        },
        "4": {
            "ja": "震度4", "en": "4", "zh": "4", "zh-TW": "4", "ko": "4",
            "vi": "4", "th": "4", "id": "4", "ms": "4", "tl": "4",
            "fr": "4", "de": "4", "it": "4", "es": "4", "ne": "4",
            "easy_ja": "しんど 4",
        },
        "5弱": {
            "ja": "震度5弱", "en": "5 Lower", "zh": "5弱", "zh-TW": "5弱", "ko": "5약",
            "vi": "5 yếu", "th": "5 อ่อน", "id": "5 Lemah", "ms": "5 Lemah", "tl": "5 Mahina",
            "fr": "5 Faible", "de": "5 Schwach", "it": "5 Debole", "es": "5 Inferior", "ne": "5 कमजोर",
            "easy_ja": "しんど 5じゃく",
        },
        "5強": {
            "ja": "震度5強", "en": "5 Upper", "zh": "5强", "zh-TW": "5強", "ko": "5강",
            "vi": "5 mạnh", "th": "5 แรง", "id": "5 Kuat", "ms": "5 Kuat", "tl": "5 Malakas",
            "fr": "5 Fort", "de": "5 Stark", "it": "5 Forte", "es": "5 Superior", "ne": "5 बलियो",
            "easy_ja": "しんど 5きょう",
        },
        "6弱": {
            "ja": "震度6弱", "en": "6 Lower", "zh": "6弱", "zh-TW": "6弱", "ko": "6약",
            "vi": "6 yếu", "th": "6 อ่อน", "id": "6 Lemah", "ms": "6 Lemah", "tl": "6 Mahina",
            "fr": "6 Faible", "de": "6 Schwach", "it": "6 Debole", "es": "6 Inferior", "ne": "6 कमजोर",
            "easy_ja": "しんど 6じゃく",
        },
        "6強": {
            "ja": "震度6強", "en": "6 Upper", "zh": "6强", "zh-TW": "6強", "ko": "6강",
            "vi": "6 mạnh", "th": "6 แรง", "id": "6 Kuat", "ms": "6 Kuat", "tl": "6 Malakas",
            "fr": "6 Fort", "de": "6 Stark", "it": "6 Forte", "es": "6 Superior", "ne": "6 बलियो",
            "easy_ja": "しんど 6きょう",
        },
        "7": {
            "ja": "震度7", "en": "7", "zh": "7", "zh-TW": "7", "ko": "7",
            "vi": "7", "th": "7", "id": "7", "ms": "7", "tl": "7",
            "fr": "7", "de": "7", "it": "7", "es": "7", "ne": "7",
            "easy_ja": "しんど 7",
        },
    }

    def __init__(self):
        """初期化"""
        from ..config import settings

        # Claude API設定
        self.anthropic_api_key = settings.anthropic_api_key
        self.anthropic_api_version = settings.anthropic_api_version
        self.anthropic_model = settings.anthropic_model

        # Gemini API設定
        self.gemini_api_key = settings.gemini_api_key
        self.gemini_model = settings.gemini_model

        # AIプロバイダー設定
        self.ai_provider = settings.ai_provider

        self.timeout = settings.api_timeout
        self.translate_timeout = httpx.Timeout(settings.ai_timeout_translate, connect=5.0)
        self.generate_timeout = httpx.Timeout(settings.ai_timeout_generate, connect=5.0)
        self._cache: dict[str, str] = {}
        self._cache_file = settings.translation_cache_file
        self._load_cache()

    def _get_active_provider(self) -> Optional[str]:
        """使用可能なAIプロバイダーを取得"""
        if self.ai_provider == "gemini" and self.gemini_api_key:
            return "gemini"
        elif self.ai_provider == "claude" and self.anthropic_api_key:
            return "claude"
        elif self.ai_provider == "auto":
            # Gemini優先
            if self.gemini_api_key:
                return "gemini"
            elif self.anthropic_api_key:
                return "claude"
        return None

    def _load_cache(self):
        """キャッシュをファイルから読み込み"""
        try:
            if self._cache_file.exists():
                with open(self._cache_file, "r", encoding="utf-8") as f:
                    self._cache = json.load(f)
        except Exception as e:
            logger.error(f"キャッシュ読み込みエラー: {e}", exc_info=True)
            self._cache = {}

    def _save_cache(self):
        """キャッシュをファイルに保存"""
        try:
            self._cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._cache_file, "w", encoding="utf-8") as f:
                json.dump(self._cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"キャッシュ保存エラー: {e}", exc_info=True)

    def _get_cache_key(self, text: str, target_lang: str) -> str:
        """キャッシュキーを生成"""
        return hashlib.md5(f"{text}:{target_lang}".encode()).hexdigest()

    def _extract_json(self, content: str) -> Optional[dict]:
        """
        AI応答からJSONを堅牢に抽出する（3段階フォールバック）

        Args:
            content: AI応答テキスト

        Returns:
            パースされた辞書、失敗時はNone
        """
        # 第1段階: 直接パース
        try:
            return json.loads(content)
        except (json.JSONDecodeError, ValueError):
            pass

        # 第2段階: マークダウンコードブロック抽出
        if "```" in content:
            try:
                code_block = content.split("```")[1]
                if code_block.startswith("json"):
                    code_block = code_block[4:]
                return json.loads(code_block.strip())
            except (json.JSONDecodeError, ValueError, IndexError):
                pass

        # 第3段階: ブレース抽出（最初の { から最後の } まで）
        first_brace = content.find("{")
        last_brace = content.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            try:
                result = json.loads(content[first_brace:last_brace + 1])
                logger.warning("JSON fallback extraction used")
                return result
            except (json.JSONDecodeError, ValueError):
                pass

        return None

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
        cache_key = self._get_cache_key(location, target_lang)
        if cache_key in self._cache:
            return self._cache[cache_key]

        # 3. AI APIで翻訳（利用可能なプロバイダーを使用）
        provider = self._get_active_provider()
        if provider:
            try:
                translated = await self._translate_with_ai(location, target_lang)
                if translated:
                    # キャッシュに保存
                    self._cache[cache_key] = translated
                    self._save_cache()
                    return translated
            except Exception as e:
                logger.error(f"AI API翻訳エラー ({provider}): {e}", exc_info=True)

        # 4. フォールバック: 元のテキストを返す
        return location

    # 言語名マッピング（共通）
    LANG_NAMES = {
        "en": "English",
        "zh": "Simplified Chinese",
        "zh-TW": "Traditional Chinese",
        "ko": "Korean",
        "vi": "Vietnamese",
        "th": "Thai",
        "id": "Indonesian",
        "ms": "Malay",
        "tl": "Filipino/Tagalog",
        "fr": "French",
        "de": "German",
        "it": "Italian",
        "es": "Spanish",
        "ne": "Nepali",
        "easy_ja": "Simple Japanese (やさしい日本語)",
    }

    async def _translate_with_ai(self, text: str, target_lang: str) -> Optional[str]:
        """
        利用可能なAI APIを使用して翻訳

        Args:
            text: 翻訳するテキスト
            target_lang: 翻訳先言語コード

        Returns:
            翻訳されたテキスト
        """
        provider = self._get_active_provider()
        if provider == "gemini":
            return await self._translate_with_gemini(text, target_lang)
        elif provider == "claude":
            return await self._translate_with_claude(text, target_lang)
        return None

    async def _translate_with_gemini(self, text: str, target_lang: str) -> Optional[str]:
        """
        Gemini APIを使用して翻訳

        Args:
            text: 翻訳するテキスト
            target_lang: 翻訳先言語コード

        Returns:
            翻訳されたテキスト
        """
        try:
            target_name = self.LANG_NAMES.get(target_lang, target_lang)

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent?key={self.gemini_api_key}"

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{
                            "parts": [{
                                "text": f"Translate this Japanese earthquake location name to {target_name}. Only output the translation, nothing else.\n\n{text}"
                            }]
                        }],
                        "generationConfig": {
                            "maxOutputTokens": 100,
                            "temperature": 0.1
                        }
                    },
                    timeout=self.translate_timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    return data["candidates"][0]["content"]["parts"][0]["text"].strip()
                else:
                    logger.warning(f"Gemini API error: {response.status_code} - {response.text}")
                    return None

        except Exception as e:
            logger.error(f"Gemini API request error: {e}", exc_info=True)
            return None

    async def _translate_with_claude(self, text: str, target_lang: str) -> Optional[str]:
        """
        Claude APIを使用して翻訳

        Args:
            text: 翻訳するテキスト
            target_lang: 翻訳先言語コード

        Returns:
            翻訳されたテキスト
        """
        try:
            target_name = self.LANG_NAMES.get(target_lang, target_lang)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "Content-Type": "application/json",
                        "X-API-Key": self.anthropic_api_key,
                        "anthropic-version": self.anthropic_api_version
                    },
                    json={
                        "model": self.anthropic_model,
                        "max_tokens": 100,
                        "messages": [{
                            "role": "user",
                            "content": f"Translate this Japanese earthquake location name to {target_name}. Only output the translation, nothing else.\n\n{text}"
                        }]
                    },
                    timeout=self.translate_timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    return data["content"][0]["text"].strip()
                else:
                    logger.warning(f"Claude API error: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Claude API request error: {e}", exc_info=True)
            return None

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

        if warning in self.TSUNAMI_TRANSLATIONS:
            return self.TSUNAMI_TRANSLATIONS[warning].get(target_lang, warning)

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
            return self.INTENSITY_TRANSLATIONS.get(intensity, {}).get("ja", intensity)

        return self.INTENSITY_TRANSLATIONS.get(intensity, {}).get(target_lang, intensity)

    async def translate(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "ja"
    ) -> str:
        """
        テキストを翻訳

        Args:
            text: 翻訳するテキスト
            target_lang: 翻訳先言語
            source_lang: 翻訳元言語

        Returns:
            str: 翻訳されたテキスト
        """
        if target_lang == source_lang:
            return text

        # テンプレートベースの翻訳を試行
        template_translation = self._try_template_translation(text, target_lang)
        if template_translation:
            return template_translation

        # AI APIで翻訳（利用可能なプロバイダーを使用）
        provider = self._get_active_provider()
        if provider:
            cache_key = self._get_cache_key(text, target_lang)
            if cache_key in self._cache:
                return self._cache[cache_key]

            try:
                translated = await self._translate_with_ai(text, target_lang)
                if translated:
                    self._cache[cache_key] = translated
                    self._save_cache()
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
            str: 翻訳されたテキスト（テンプレートが見つからない場合はNone）
        """
        for template_key, translations in self.TEMPLATES.items():
            ja_template = translations.get("ja", "")
            if any(keyword in text for keyword in self._extract_keywords(ja_template)):
                if target_lang in translations:
                    return translations[target_lang]

        return None

    def _extract_keywords(self, template: str) -> list[str]:
        """
        テンプレートからキーワードを抽出

        Args:
            template: テンプレート文字列

        Returns:
            list[str]: キーワードリスト
        """
        keywords = []
        for word in ["地震", "津波", "避難", "警報", "注意報"]:
            if word in template:
                keywords.append(word)
        return keywords

    def get_template(
        self,
        template_key: str,
        lang: str,
        **kwargs
    ) -> Optional[str]:
        """
        テンプレートを取得してフォーマット

        Args:
            template_key: テンプレートキー
            lang: 言語コード
            **kwargs: テンプレートに埋め込む変数

        Returns:
            str: フォーマットされたテンプレート
        """
        templates = self.TEMPLATES.get(template_key, {})
        template = templates.get(lang) or templates.get("ja")

        if template:
            try:
                return template.format(**kwargs)
            except KeyError:
                return template

        return None

    def generate_earthquake_message(
        self,
        lang: str,
        location: str,
        magnitude: float,
        intensity: str,
        depth: int,
        tsunami_warning: str,
        tsunami_warning_translated: str
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
            str: 翻訳されたメッセージ
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
            tsunami_info=tsunami_info
        )

    def get_supported_languages(self) -> dict:
        """
        サポートする言語一覧を取得

        Returns:
            dict: 言語コードと言語名のマッピング
        """
        return self.LANGUAGE_NAMES.copy()

    def get_static_location_count(self) -> int:
        """
        静的マッピングに登録されている地名数を取得

        Returns:
            int: 登録地名数
        """
        return len(LOCATION_TRANSLATIONS)

    async def generate_warning_text(
        self,
        warning_name_ja: str,
        target_lang: str,
        area_name: Optional[str] = None,
        severity: str = "medium"
    ) -> dict[str, str]:
        """
        警報名と説明文をClaude APIで動的生成

        Args:
            warning_name_ja: 日本語の警報名（例: "大雨警報"）
            target_lang: 翻訳先言語コード
            area_name: 地域名（オプション）
            severity: 重要度（low, medium, high, extreme）

        Returns:
            dict: {"name": 翻訳された警報名, "description": 説明文, "action": 推奨行動}
        """
        if target_lang == "ja":
            return {
                "name": warning_name_ja,
                "description": f"{area_name}に{warning_name_ja}が発表されています。" if area_name else f"{warning_name_ja}が発表されています。",
                "action": self._get_default_action_ja(severity)
            }

        # キャッシュを確認
        cache_key = self._get_cache_key(f"warning:{warning_name_ja}:{area_name}:{severity}", target_lang)
        if cache_key in self._cache:
            try:
                return json.loads(self._cache[cache_key])
            except json.JSONDecodeError:
                pass

        # AI APIで生成
        provider = self._get_active_provider()
        if provider:
            try:
                result = await self._generate_warning_with_ai(
                    warning_name_ja, target_lang, area_name, severity
                )
                if result:
                    # キャッシュに保存
                    self._cache[cache_key] = json.dumps(result, ensure_ascii=False)
                    self._save_cache()
                    return result
            except Exception as e:
                logger.error(f"警報テキスト生成エラー ({provider}): {e}", exc_info=True)

        # フォールバック: 基本的な翻訳のみ
        fallback_name = await self._translate_with_ai(warning_name_ja, target_lang) if provider else warning_name_ja
        return {
            "name": fallback_name or warning_name_ja,
            "description": "",
            "action": ""
        }

    async def _generate_warning_with_ai(
        self,
        warning_name_ja: str,
        target_lang: str,
        area_name: Optional[str],
        severity: str
    ) -> Optional[dict[str, str]]:
        """
        利用可能なAI APIを使用して警報テキストを生成

        Args:
            warning_name_ja: 日本語の警報名
            target_lang: 翻訳先言語コード
            area_name: 地域名
            severity: 重要度

        Returns:
            dict: 生成されたテキスト
        """
        provider = self._get_active_provider()
        if provider == "gemini":
            return await self._generate_warning_with_gemini(warning_name_ja, target_lang, area_name, severity)
        elif provider == "claude":
            return await self._generate_warning_with_claude(warning_name_ja, target_lang, area_name, severity)
        return None

    def _build_warning_prompt(self, warning_name_ja: str, target_lang: str, area_name: Optional[str], severity: str) -> str:
        """警報生成用のプロンプトを構築"""
        target_name = self.LANG_NAMES.get(target_lang, target_lang)

        severity_context = {
            "low": "minor advisory",
            "medium": "advisory requiring attention",
            "high": "serious warning requiring caution",
            "extreme": "emergency warning requiring immediate action"
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

    async def _generate_warning_with_gemini(
        self,
        warning_name_ja: str,
        target_lang: str,
        area_name: Optional[str],
        severity: str
    ) -> Optional[dict[str, str]]:
        """
        Gemini APIを使用して警報テキストを生成
        """
        try:
            prompt = self._build_warning_prompt(warning_name_ja, target_lang, area_name, severity)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent?key={self.gemini_api_key}"

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{
                            "parts": [{"text": prompt}]
                        }],
                        "generationConfig": {
                            "maxOutputTokens": 500,
                            "temperature": 0.1
                        }
                    },
                    timeout=self.generate_timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    result = self._extract_json(content)
                    if result:
                        return {
                            "name": result.get("name", warning_name_ja),
                            "description": result.get("description", ""),
                            "action": result.get("action", "")
                        }
                    logger.warning(f"Gemini応答のJSONパースエラー: {content[:200]}")
                    return None
                else:
                    logger.warning(f"Gemini API error: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Gemini警報テキスト生成エラー: {e}", exc_info=True)
            return None

    async def _generate_warning_with_claude(
        self,
        warning_name_ja: str,
        target_lang: str,
        area_name: Optional[str],
        severity: str
    ) -> Optional[dict[str, str]]:
        """
        Claude APIを使用して警報テキストを生成
        """
        try:
            prompt = self._build_warning_prompt(warning_name_ja, target_lang, area_name, severity)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "Content-Type": "application/json",
                        "X-API-Key": self.anthropic_api_key,
                        "anthropic-version": self.anthropic_api_version
                    },
                    json={
                        "model": self.anthropic_model,
                        "max_tokens": 500,
                        "messages": [{
                            "role": "user",
                            "content": prompt
                        }]
                    },
                    timeout=self.generate_timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data["content"][0]["text"].strip()
                    result = self._extract_json(content)
                    if result:
                        return {
                            "name": result.get("name", warning_name_ja),
                            "description": result.get("description", ""),
                            "action": result.get("action", "")
                        }
                    logger.warning(f"Claude応答のJSONパースエラー: {content[:200]}")
                    return None
                else:
                    logger.warning(f"Claude API error: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Claude警報テキスト生成エラー: {e}", exc_info=True)
            return None

    def _get_default_action_ja(self, severity: str) -> str:
        """日本語のデフォルト推奨行動を取得"""
        actions = {
            "low": "最新の情報に注意してください。",
            "medium": "今後の情報に注意し、必要に応じて安全な場所へ移動してください。",
            "high": "屋外での活動を控え、安全な場所で待機してください。",
            "extreme": "直ちに安全な場所へ避難してください。命を守る行動を取ってください。"
        }
        return actions.get(severity, actions["medium"])

    # 災害種別の多言語マッピング
    DISASTER_TYPES = {
        "earthquake": {
            "ja": "地震", "en": "Earthquake", "zh": "地震", "ko": "지진",
            "vi": "Động đất", "th": "แผ่นดินไหว", "fr": "Séisme", "de": "Erdbeben",
            "es": "Terremoto", "it": "Terremoto", "id": "Gempa bumi", "ms": "Gempa bumi",
            "tl": "Lindol", "ne": "भूकम्प", "zh-TW": "地震", "easy_ja": "じしん"
        },
        "tsunami": {
            "ja": "津波", "en": "Tsunami", "zh": "海啸", "ko": "쓰나미",
            "vi": "Sóng thần", "th": "สึนามิ", "fr": "Tsunami", "de": "Tsunami",
            "es": "Tsunami", "it": "Tsunami", "id": "Tsunami", "ms": "Tsunami",
            "tl": "Tsunami", "ne": "सुनामी", "zh-TW": "海嘯", "easy_ja": "つなみ"
        },
        "flood": {
            "ja": "洪水", "en": "Flood", "zh": "洪水", "ko": "홍수",
            "vi": "Lũ lụt", "th": "น้ำท่วม", "fr": "Inondation", "de": "Überschwemmung",
            "es": "Inundación", "it": "Alluvione", "id": "Banjir", "ms": "Banjir",
            "tl": "Baha", "ne": "बाढी", "zh-TW": "洪水", "easy_ja": "こうずい"
        },
        "typhoon": {
            "ja": "台風", "en": "Typhoon", "zh": "台风", "ko": "태풍",
            "vi": "Bão", "th": "พายุไต้ฝุ่น", "fr": "Typhon", "de": "Taifun",
            "es": "Tifón", "it": "Tifone", "id": "Topan", "ms": "Taufan",
            "tl": "Bagyo", "ne": "आँधी", "zh-TW": "颱風", "easy_ja": "たいふう"
        },
        "volcano": {
            "ja": "火山噴火", "en": "Volcanic Eruption", "zh": "火山喷发", "ko": "화산 분화",
            "vi": "Núi lửa phun trào", "th": "ภูเขาไฟระเบิด", "fr": "Éruption volcanique", "de": "Vulkanausbruch",
            "es": "Erupción volcánica", "it": "Eruzione vulcanica", "id": "Letusan gunung berapi", "ms": "Letusan gunung berapi",
            "tl": "Pagsabog ng bulkan", "ne": "ज्वालामुखी विस्फोट", "zh-TW": "火山噴發", "easy_ja": "かざん ふんか"
        },
        "landslide": {
            "ja": "土砂災害", "en": "Landslide", "zh": "山体滑坡", "ko": "산사태",
            "vi": "Sạt lở đất", "th": "ดินถล่ม", "fr": "Glissement de terrain", "de": "Erdrutsch",
            "es": "Deslizamiento de tierra", "it": "Frana", "id": "Tanah longsor", "ms": "Tanah runtuh",
            "tl": "Pagguho ng lupa", "ne": "पहिरो", "zh-TW": "土石流", "easy_ja": "どしゃ さいがい"
        }
    }

    async def generate_safety_guide(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str] = None,
        severity: str = "medium"
    ) -> Optional[dict]:
        """
        災害種別に応じた安全ガイドを生成

        Args:
            disaster_type: 災害種別（earthquake, tsunami, flood, typhoon, volcano, landslide）
            target_lang: 言語コード
            location: 地域名（オプション）
            severity: 重要度（low, medium, high, extreme）

        Returns:
            dict: 安全ガイド情報
        """
        # キャッシュキー生成
        cache_key = self._get_cache_key(f"safety:{disaster_type}:{location}:{severity}", target_lang)

        # キャッシュ確認
        if cache_key in self._cache:
            try:
                cached_data = json.loads(self._cache[cache_key])
                cached_data["cached"] = True
                return cached_data
            except json.JSONDecodeError:
                pass

        # AI APIで生成
        provider = self._get_active_provider()
        if provider:
            try:
                result = await self._generate_safety_guide_with_ai(
                    disaster_type, target_lang, location, severity
                )
                if result:
                    # キャッシュに保存
                    self._cache[cache_key] = json.dumps(result, ensure_ascii=False)
                    self._save_cache()
                    return result
            except Exception as e:
                logger.error(f"安全ガイド生成エラー ({provider}): {e}", exc_info=True)

        # フォールバック: 基本的なガイドを返す
        return self._get_fallback_safety_guide(disaster_type, target_lang, location, severity)

    def _build_safety_guide_prompt(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str],
        severity: str
    ) -> str:
        """安全ガイド生成用のプロンプトを構築"""
        target_name = self.LANG_NAMES.get(target_lang, target_lang)

        severity_context = {
            "low": "minor risk, general awareness needed",
            "medium": "moderate risk, caution advised",
            "high": "serious risk, immediate precautions needed",
            "extreme": "life-threatening emergency, immediate action required"
        }
        severity_desc = severity_context.get(severity, "moderate risk")

        location_context = f" in {location}" if location else ""

        return f"""Generate a comprehensive safety guide for {disaster_type}{location_context} in {target_name}.

Severity level: {severity_desc}

Return ONLY a JSON object with these exact keys (no markdown, no explanation):
{{
  "title": "Safety guide title in {target_name}",
  "summary": "Brief 1-2 sentence summary of what to do",
  "immediate_actions": ["action 1", "action 2", "action 3", "action 4", "action 5"],
  "preparation_tips": ["tip 1", "tip 2", "tip 3"],
  "evacuation_info": "Information about when and where to evacuate",
  "emergency_contacts": "Emergency numbers and resources (use Japan numbers: Police 110, Fire/Ambulance 119, Coast Guard 118)",
  "additional_notes": "Any additional important information"
}}

Important guidelines:
- All text must be in {target_name}
- For "easy_ja", use simple hiragana and basic vocabulary with spaces between words
- immediate_actions should be specific, actionable steps in order of priority
- Include Japan-specific emergency information
- Be culturally appropriate and practical
- Focus on life-saving information first"""

    async def _generate_safety_guide_with_ai(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str],
        severity: str
    ) -> Optional[dict]:
        """AIを使用して安全ガイドを生成"""
        provider = self._get_active_provider()
        if provider == "gemini":
            return await self._generate_safety_guide_with_gemini(disaster_type, target_lang, location, severity)
        elif provider == "claude":
            return await self._generate_safety_guide_with_claude(disaster_type, target_lang, location, severity)
        return None

    async def _generate_safety_guide_with_gemini(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str],
        severity: str
    ) -> Optional[dict]:
        """Gemini APIを使用して安全ガイドを生成"""
        try:
            prompt = self._build_safety_guide_prompt(disaster_type, target_lang, location, severity)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent?key={self.gemini_api_key}"

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "maxOutputTokens": 1500,
                            "temperature": 0.2
                        }
                    },
                    timeout=self.generate_timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    result = self._extract_json(content)
                    if result:
                        result["cached"] = False
                        return result
                    logger.warning(f"Gemini安全ガイドのJSONパースエラー: {content[:200]}")
                    return None
                else:
                    logger.warning(f"Gemini API error: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Gemini安全ガイド生成エラー: {e}", exc_info=True)
            return None

    async def _generate_safety_guide_with_claude(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str],
        severity: str
    ) -> Optional[dict]:
        """Claude APIを使用して安全ガイドを生成"""
        try:
            prompt = self._build_safety_guide_prompt(disaster_type, target_lang, location, severity)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "Content-Type": "application/json",
                        "X-API-Key": self.anthropic_api_key,
                        "anthropic-version": self.anthropic_api_version
                    },
                    json={
                        "model": self.anthropic_model,
                        "max_tokens": 1500,
                        "messages": [{"role": "user", "content": prompt}]
                    },
                    timeout=self.generate_timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data["content"][0]["text"].strip()
                    result = self._extract_json(content)
                    if result:
                        result["cached"] = False
                        return result
                    logger.warning(f"Claude安全ガイドのJSONパースエラー: {content[:200]}")
                    return None
                else:
                    logger.warning(f"Claude API error: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Claude安全ガイド生成エラー: {e}", exc_info=True)
            return None

    def _get_fallback_safety_guide(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str],
        severity: str
    ) -> dict:
        """フォールバック用の基本安全ガイド（日本語）"""
        disaster_name = self.DISASTER_TYPES.get(disaster_type, {}).get("ja", disaster_type)

        return {
            "title": f"{disaster_name}の安全ガイド",
            "summary": f"{disaster_name}が発生した場合の安全対策です。落ち着いて行動してください。",
            "immediate_actions": [
                "身の安全を確保してください",
                "最新の情報を確認してください",
                "必要に応じて避難してください"
            ],
            "preparation_tips": [
                "非常用持ち出し袋を準備しておきましょう",
                "避難場所を確認しておきましょう"
            ],
            "evacuation_info": "市区町村の指示に従って避難してください",
            "emergency_contacts": "警察: 110 / 消防・救急: 119 / 海上保安庁: 118",
            "additional_notes": "正確な情報は公式発表をご確認ください",
            "cached": False
        }

    def get_disaster_type_name(self, disaster_type: str, lang: str) -> str:
        """災害種別の翻訳名を取得"""
        return self.DISASTER_TYPES.get(disaster_type, {}).get(lang, disaster_type)
