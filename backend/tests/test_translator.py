import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.translator import TranslatorService


@pytest.fixture
def mock_settings():
    with patch("app.config.settings") as mock:
        mock.anthropic_api_key = "test_key"
        mock.gemini_api_key = "test_key"
        mock.gemini_model = "gemini-2.0-flash"
        mock.anthropic_model = "claude-sonnet-4-20250514"
        mock.anthropic_api_version = "2023-06-01"
        mock.ai_provider = "auto"
        mock.api_timeout = 10.0
        mock.ai_timeout_translate = 10.0
        mock.ai_timeout_generate = 30.0
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
    # キャッシュを手動で設定（インメモリdictに直接書き込み — DBは不要）
    cache_key = translator._get_cache_key("未知の地名", "en")
    translator._cache._cache[cache_key] = "Unknown Place"

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


def test_template_translation_no_keyword_false_positive(translator):
    """キーワード部分一致による誤マッチが起きないことのテスト

    旧実装では「警報」を含むだけで津波警報テンプレートが返り、
    大雨警報等が津波警報として誤訳されていた（完全一致のみ許可に修正済み）。
    """
    assert translator._try_template_translation("大雨特別警報", "en") is None
    assert translator._try_template_translation(
        "東京地方に大雨警報が発表されています。", "en"
    ) is None
    # プレースホルダー入りテンプレートは未展開のまま返さない
    assert translator._try_template_translation(
        "【地震情報】東京湾で地震がありました。マグニチュード4.0、最大震度3。", "en"
    ) is None
    # 完全一致する定型文は引き続き翻訳される
    assert (
        translator._try_template_translation("この地震による津波の心配はありません。", "en")
        == "There is no tsunami risk from this earthquake."
    )


@pytest.mark.asyncio
async def test_translate_uses_cache_without_provider():
    """AIプロバイダー未設定でもDB復元済みキャッシュから翻訳が返るテスト"""
    with patch("app.config.settings") as mock:
        mock.anthropic_api_key = None
        mock.gemini_api_key = None
        mock.gemini_model = "gemini-2.0-flash"
        mock.anthropic_model = "claude-sonnet-4-20250514"
        mock.anthropic_api_version = "2023-06-01"
        mock.ai_provider = "auto"
        mock.api_timeout = 10.0
        mock.ai_timeout_translate = 10.0
        mock.ai_timeout_generate = 30.0
        no_provider_translator = TranslatorService()

    cache_key = no_provider_translator._get_cache_key("曇りのち晴れ", "en")
    no_provider_translator._cache._cache[cache_key] = "Cloudy then sunny"

    result = await no_provider_translator.translate("曇りのち晴れ", "en")
    assert result == "Cloudy then sunny"


def test_get_supported_languages(translator):
    """対応言語一覧の取得テスト"""
    langs = translator.get_supported_languages()
    assert "ja" in langs
    assert "en" in langs
    assert len(langs) >= 15
