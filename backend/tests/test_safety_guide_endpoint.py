"""`/api/v1/safety-guide` のフォールバック挙動（エンドポイント経由）

AI プロバイダが使えないとき、静的な多言語フォールバックがそのまま
レスポンスに載ることを確認する。`SafetyGuide` は main.py で明示フィールド
指定して構築されるため、配線が抜けると値が黙って落ちる。
"""
import re

import pytest

from app.services.safety_guide_fallback import build_fallback_guide

# ひらがな・カタカナ（カタカナ中黒 U+30FB は含めない）
KANA = re.compile(r"[ぁ-ゖァ-ヺー]")


@pytest.fixture
def no_ai_provider(monkeypatch):
    """AI プロバイダが1つも設定されていない状態を作る"""
    from app.services.ai_provider import AIProvider

    monkeypatch.setattr(AIProvider, "get_active_provider", lambda self: None)


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    """このエンドポイントは 10回/分 のレート制限があるため、テスト中は無効化する"""
    from app.main import limiter

    monkeypatch.setattr(limiter, "enabled", False)


@pytest.mark.parametrize("lang", ["en", "ko", "th", "zh-TW", "ne", "es"])
async def test_AI不在時はその言語のフォールバックが返る(client, no_ai_provider, lang):
    res = await client.get(f"/api/v1/safety-guide?disaster_type=earthquake&lang={lang}")
    assert res.status_code == 200
    body = res.json()

    expected = build_fallback_guide("earthquake", lang)
    assert body["title"] == expected["title"]
    assert body["summary"] == expected["summary"]
    assert body["immediate_actions"] == expected["immediate_actions"]
    assert body["language"] == lang


async def test_AI不在時は_fallback_フラグが_true_で返る(client, no_ai_provider):
    """本修正の配線ガード。main.py が fallback を渡さないとここが落ちる。"""
    res = await client.get("/api/v1/safety-guide?disaster_type=earthquake&lang=en")
    assert res.status_code == 200
    assert res.json()["fallback"] is True


@pytest.mark.parametrize("lang", ["en", "ko", "th", "vi", "fr"])
async def test_日本語以外の言語で日本語のかなが返らない(client, no_ai_provider, lang):
    """以前はフォールバックが日本語のみを返していた（本修正の主目的）。"""
    res = await client.get(f"/api/v1/safety-guide?disaster_type=tsunami&lang={lang}")
    assert res.status_code == 200
    body = res.json()

    for key in ("title", "summary", "evacuation_info", "emergency_contacts", "additional_notes"):
        assert not KANA.search(body[key] or ""), f"{lang} の {key} に日本語のかな: {body[key]}"
    for text in body["immediate_actions"] + body["preparation_tips"]:
        assert not KANA.search(text), f"{lang} に日本語のかな: {text}"


async def test_全16言語で200が返る(client, no_ai_provider):
    langs = [
        "ja", "en", "zh", "zh-TW", "ko", "vi", "th", "id",
        "ms", "tl", "ne", "fr", "de", "it", "es", "easy_ja",
    ]
    for lang in langs:
        res = await client.get(f"/api/v1/safety-guide?disaster_type=flood&lang={lang}")
        assert res.status_code == 200, f"{lang}: {res.status_code} {res.text[:200]}"
        assert res.json()["title"]
