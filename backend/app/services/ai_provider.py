"""
AI プロバイダー統合

Gemini / Claude API の選択・呼び出し・JSON抽出を担当。
"""
import json
from typing import Optional

import httpx

from .translation_templates import LANG_NAMES
from ..utils.logger import get_logger

logger = get_logger(__name__)


class AIProvider:
    """Gemini / Claude API プロバイダー"""

    def __init__(
        self,
        *,
        ai_provider: str,
        gemini_api_key: Optional[str],
        gemini_model: str,
        anthropic_api_key: Optional[str],
        anthropic_model: str,
        anthropic_api_version: str,
        translate_timeout: httpx.Timeout,
        generate_timeout: httpx.Timeout,
    ):
        self.ai_provider = ai_provider
        self.gemini_api_key = gemini_api_key
        self.gemini_model = gemini_model
        self.anthropic_api_key = anthropic_api_key
        self.anthropic_model = anthropic_model
        self.anthropic_api_version = anthropic_api_version
        self.translate_timeout = translate_timeout
        self.generate_timeout = generate_timeout

    # ------------------------------------------------------------------
    # プロバイダー選択
    # ------------------------------------------------------------------

    def get_active_provider(self) -> Optional[str]:
        """
        使用可能なAIプロバイダーを取得

        Returns:
            "gemini", "claude", またはNone
        """
        if self.ai_provider == "gemini" and self.gemini_api_key:
            return "gemini"
        elif self.ai_provider == "claude" and self.anthropic_api_key:
            return "claude"
        elif self.ai_provider == "auto":
            if self.gemini_api_key:
                return "gemini"
            elif self.anthropic_api_key:
                return "claude"
        return None

    # ------------------------------------------------------------------
    # 翻訳
    # ------------------------------------------------------------------

    async def translate_text(self, text: str, target_lang: str) -> Optional[str]:
        """
        AI APIを使用してテキストを翻訳

        Args:
            text: 翻訳するテキスト
            target_lang: 翻訳先言語コード

        Returns:
            翻訳されたテキスト、失敗時None
        """
        provider = self.get_active_provider()
        if provider == "gemini":
            return await self._translate_with_gemini(text, target_lang)
        elif provider == "claude":
            return await self._translate_with_claude(text, target_lang)
        return None

    async def _translate_with_gemini(self, text: str, target_lang: str) -> Optional[str]:
        """Gemini APIを使用して翻訳"""
        try:
            target_name = LANG_NAMES.get(target_lang, target_lang)
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{self.gemini_model}:generateContent?key={self.gemini_api_key}"
            )

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{
                            "parts": [{
                                "text": (
                                    f"Translate this Japanese earthquake location name to {target_name}. "
                                    f"Only output the translation, nothing else.\n\n{text}"
                                )
                            }]
                        }],
                        "generationConfig": {
                            "maxOutputTokens": 100,
                            "temperature": 0.1,
                        },
                    },
                    timeout=self.translate_timeout,
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
        """Claude APIを使用して翻訳"""
        try:
            target_name = LANG_NAMES.get(target_lang, target_lang)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "Content-Type": "application/json",
                        "X-API-Key": self.anthropic_api_key,
                        "anthropic-version": self.anthropic_api_version,
                    },
                    json={
                        "model": self.anthropic_model,
                        "max_tokens": 100,
                        "messages": [{
                            "role": "user",
                            "content": (
                                f"Translate this Japanese earthquake location name to {target_name}. "
                                f"Only output the translation, nothing else.\n\n{text}"
                            ),
                        }],
                    },
                    timeout=self.translate_timeout,
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

    # ------------------------------------------------------------------
    # テキスト生成（JSON応答）
    # ------------------------------------------------------------------

    async def generate_json(self, prompt: str, max_tokens: int = 500) -> Optional[dict]:
        """
        AI APIでテキスト生成し、JSONとしてパースして返す

        Args:
            prompt: プロンプト
            max_tokens: 最大トークン数

        Returns:
            パースされた辞書、失敗時None
        """
        provider = self.get_active_provider()
        if provider == "gemini":
            return await self._generate_with_gemini(prompt, max_tokens)
        elif provider == "claude":
            return await self._generate_with_claude(prompt, max_tokens)
        return None

    async def _generate_with_gemini(self, prompt: str, max_tokens: int) -> Optional[dict]:
        """Gemini APIでJSON生成"""
        try:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{self.gemini_model}:generateContent?key={self.gemini_api_key}"
            )

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "maxOutputTokens": max_tokens,
                            "temperature": 0.1 if max_tokens <= 500 else 0.2,
                        },
                    },
                    timeout=self.generate_timeout,
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    result = self.extract_json(content)
                    if result is None:
                        logger.warning(f"Gemini応答のJSONパースエラー: {content[:200]}")
                    return result
                else:
                    logger.warning(f"Gemini API error: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Gemini API生成エラー: {e}", exc_info=True)
            return None

    async def _generate_with_claude(self, prompt: str, max_tokens: int) -> Optional[dict]:
        """Claude APIでJSON生成"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "Content-Type": "application/json",
                        "X-API-Key": self.anthropic_api_key,
                        "anthropic-version": self.anthropic_api_version,
                    },
                    json={
                        "model": self.anthropic_model,
                        "max_tokens": max_tokens,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                    timeout=self.generate_timeout,
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data["content"][0]["text"].strip()
                    result = self.extract_json(content)
                    if result is None:
                        logger.warning(f"Claude応答のJSONパースエラー: {content[:200]}")
                    return result
                else:
                    logger.warning(f"Claude API error: {response.status_code}")
                    return None

        except Exception as e:
            logger.error(f"Claude API生成エラー: {e}", exc_info=True)
            return None

    # ------------------------------------------------------------------
    # JSON 抽出（3段階フォールバック）
    # ------------------------------------------------------------------

    @staticmethod
    def extract_json(content: str) -> Optional[dict]:
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
