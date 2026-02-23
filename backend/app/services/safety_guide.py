"""
安全ガイド生成

災害種別に応じた多言語安全ガイドをAI APIで生成。
キャッシュ連携あり。
"""
import json
from typing import Optional

from .ai_provider import AIProvider
from .translation_cache import TranslationCache
from .translation_templates import LANG_NAMES, DISASTER_TYPES
from ..utils.logger import get_logger

logger = get_logger(__name__)


class SafetyGuideGenerator:
    """災害安全ガイド生成"""

    def __init__(self, ai_provider: AIProvider, cache: TranslationCache):
        self._ai = ai_provider
        self._cache = cache

    async def generate(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str] = None,
        severity: str = "medium",
    ) -> Optional[dict]:
        """
        災害種別に応じた安全ガイドを生成

        Args:
            disaster_type: 災害種別（earthquake, tsunami, flood, typhoon, volcano, landslide）
            target_lang: 言語コード
            location: 地域名（オプション）
            severity: 重要度（low, medium, high, extreme）

        Returns:
            安全ガイド情報の辞書
        """
        # キャッシュ確認
        cache_key = self._cache.make_key(f"safety:{disaster_type}:{location}:{severity}", target_lang)
        cached = self._cache.get(cache_key)
        if cached:
            try:
                cached_data = json.loads(cached)
                cached_data["cached"] = True
                return cached_data
            except json.JSONDecodeError:
                pass

        # AI APIで生成
        provider = self._ai.get_active_provider()
        if provider:
            try:
                prompt = self._build_prompt(disaster_type, target_lang, location, severity)
                result = await self._ai.generate_json(prompt, max_tokens=1500)
                if result:
                    result["cached"] = False
                    # キャッシュに保存
                    self._cache.set(cache_key, json.dumps(result, ensure_ascii=False))
                    return result
            except Exception as e:
                logger.error(f"安全ガイド生成エラー ({provider}): {e}", exc_info=True)

        # フォールバック: 基本的なガイドを返す
        return self._get_fallback(disaster_type, target_lang, location, severity)

    def _build_prompt(
        self,
        disaster_type: str,
        target_lang: str,
        location: Optional[str],
        severity: str,
    ) -> str:
        """安全ガイド生成用のプロンプトを構築"""
        target_name = LANG_NAMES.get(target_lang, target_lang)

        severity_context = {
            "low": "minor risk, general awareness needed",
            "medium": "moderate risk, caution advised",
            "high": "serious risk, immediate precautions needed",
            "extreme": "life-threatening emergency, immediate action required",
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

    @staticmethod
    def _get_fallback(
        disaster_type: str,
        target_lang: str,
        location: Optional[str],
        severity: str,
    ) -> dict:
        """フォールバック用の基本安全ガイド（日本語）"""
        disaster_name = DISASTER_TYPES.get(disaster_type, {}).get("ja", disaster_type)

        return {
            "title": f"{disaster_name}の安全ガイド",
            "summary": f"{disaster_name}が発生した場合の安全対策です。落ち着いて行動してください。",
            "immediate_actions": [
                "身の安全を確保してください",
                "最新の情報を確認してください",
                "必要に応じて避難してください",
            ],
            "preparation_tips": [
                "非常用持ち出し袋を準備しておきましょう",
                "避難場所を確認しておきましょう",
            ],
            "evacuation_info": "市区町村の指示に従って避難してください",
            "emergency_contacts": "警察: 110 / 消防・救急: 119 / 海上保安庁: 118",
            "additional_notes": "正確な情報は公式発表をご確認ください",
            "cached": False,
        }
