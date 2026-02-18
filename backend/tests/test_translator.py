import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.translator import TranslatorService

@pytest.fixture
def mock_settings():
    with patch("app.config.settings") as mock:
        mock.anthropic_api_key = "test_key"
        mock.gemini_api_key = "test_key"
        mock.ai_provider = "auto"
        mock.api_timeout = 10.0
        mock.translation_cache_file.exists.return_value = False
        yield mock

@pytest.fixture
def translator(mock_settings):
    return TranslatorService()

@pytest.mark.asyncio
async def test_translate_location_static(translator):
    """静的マッピングによる地名翻訳のテスト"""
    # 北海道北西沖 -> Off the northwest coast of Hokkaido (静的マッピングに存在)
    result = await translator.translate_location("北海道北西沖", "en")
    assert result == "Off the northwest coast of Hokkaido"

@pytest.mark.asyncio
async def test_translate_location_no_change(translator):
    """同じ言語の場合は翻訳しないテスト"""
    result = await translator.translate_location("東京", "ja")
    assert result == "東京"

@pytest.mark.asyncio
async def test_translate_cache_hit(translator):
    """キャッシュヒットのテスト"""
    # キャッシュを手動で設定
    cache_key = translator._get_cache_key("未知の地名", "en")
    translator._cache[cache_key] = "Unknown Place"
    
    # モックのAI翻訳メソッド（呼ばれてはいけない）
    translator._translate_with_ai = AsyncMock()
    
    result = await translator.translate_location("未知の地名", "en")
    assert result == "Unknown Place"
    translator._translate_with_ai.assert_not_called()

@pytest.mark.asyncio
async def test_template_translation(translator):
    """テンプレート翻訳のテスト"""
    # 津波警報の定型文
    text = "【津波警報】沿岸部の方は直ちに高台に避難してください。"
    result = await translator.translate(text, "en")
    assert "Tsunami Warning" in result
    assert "evacuate" in result.lower()

def test_get_supported_languages(translator):
    """対応言語一覧の取得テスト"""
    langs = translator.get_supported_languages()
    assert "ja" in langs
    assert "en" in langs
    assert len(langs) >= 15
