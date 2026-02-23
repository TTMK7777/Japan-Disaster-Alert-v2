"""
AIProvider のユニットテスト
"""
import pytest
import httpx

from app.services.ai_provider import AIProvider


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _make_provider(
    ai_provider: str = "auto",
    gemini_key: str | None = "test_gemini_key",
    anthropic_key: str | None = "test_anthropic_key",
) -> AIProvider:
    """テスト用 AIProvider インスタンスを生成する"""
    return AIProvider(
        ai_provider=ai_provider,
        gemini_api_key=gemini_key,
        gemini_model="gemini-2.0-flash",
        anthropic_api_key=anthropic_key,
        anthropic_model="claude-haiku-4-5-20251001",
        anthropic_api_version="2023-06-01",
        translate_timeout=httpx.Timeout(10.0),
        generate_timeout=httpx.Timeout(30.0),
    )


# ---------------------------------------------------------------------------
# get_active_provider
# ---------------------------------------------------------------------------

def test_get_active_provider_auto_gemini():
    """auto設定時にGeminiが優先される"""
    provider = _make_provider(ai_provider="auto", gemini_key="gk", anthropic_key="ak")
    assert provider.get_active_provider() == "gemini"


def test_get_active_provider_auto_claude():
    """auto設定 + Geminiキーなし の場合にClaudeが選択される"""
    provider = _make_provider(ai_provider="auto", gemini_key=None, anthropic_key="ak")
    assert provider.get_active_provider() == "claude"


def test_get_active_provider_none():
    """両方のキーが未設定の場合に None が返る"""
    provider = _make_provider(ai_provider="auto", gemini_key=None, anthropic_key=None)
    assert provider.get_active_provider() is None


# ---------------------------------------------------------------------------
# extract_json
# ---------------------------------------------------------------------------

def test_extract_json_direct():
    """有効なJSON文字列が直接パースされる"""
    raw = '{"key": "value", "num": 42}'
    result = AIProvider.extract_json(raw)
    assert result == {"key": "value", "num": 42}


def test_extract_json_code_block():
    """マークダウンコードブロック内のJSONが抽出される"""
    raw = 'Here is the result:\n```json\n{"title": "Earthquake Alert"}\n```\nDone.'
    result = AIProvider.extract_json(raw)
    assert result == {"title": "Earthquake Alert"}


def test_extract_json_brace_extraction():
    """ブレース抽出フォールバックで最初の { から最後の } までが抽出される"""
    raw = 'Some preamble text {"fallback": true} trailing text'
    result = AIProvider.extract_json(raw)
    assert result == {"fallback": True}


def test_extract_json_invalid_returns_none():
    """JSONが含まれない入力で None が返る"""
    raw = "This is just plain text without any JSON."
    result = AIProvider.extract_json(raw)
    assert result is None
