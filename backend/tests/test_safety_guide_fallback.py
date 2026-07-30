"""安全ガイドのフォールバック（AI 非依存・16言語）のテスト"""
import re

import pytest

from app.services.safety_guide_fallback import (
    DEFAULT_LANG,
    GUIDE_FIELDS,
    SAFETY_GUIDE_FALLBACK,
    build_fallback_guide,
    localized_disaster_name,
)
from app.services.translation_templates import DISASTER_TYPES

# UI が対応している 16 言語
EXPECTED_LANGS = {
    "ja", "en", "zh", "zh-TW", "ko", "vi", "th", "id",
    "ms", "tl", "ne", "fr", "de", "it", "es", "easy_ja",
}

# 日本語の文字（ひらがな・カタカナ・漢字）。ただし中国語と共通の漢字は除外できないため
# 「ひらがな・カタカナが含まれるか」で日本語混入を判定する
KANA = re.compile(r"[぀-ヿ]")


def _all_strings(guide: dict) -> list[str]:
    out = []
    for key in GUIDE_FIELDS:
        value = guide[key]
        out.extend(value if isinstance(value, list) else [value])
    return out


class TestCoverage:
    def test_16言語すべてのテンプレートが存在する(self):
        assert set(SAFETY_GUIDE_FALLBACK) == EXPECTED_LANGS

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS))
    def test_全言語で必須フィールドが揃っている(self, lang):
        template = SAFETY_GUIDE_FALLBACK[lang]
        for field in GUIDE_FIELDS:
            assert field in template, f"{lang} に {field} が無い"
            assert template[field], f"{lang} の {field} が空"

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS))
    def test_全言語で行動と備えが複数件ある(self, lang):
        template = SAFETY_GUIDE_FALLBACK[lang]
        assert len(template["immediate_actions"]) >= 3
        assert len(template["preparation_tips"]) >= 2


class TestBuild:
    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS))
    @pytest.mark.parametrize("disaster", sorted(DISASTER_TYPES))
    def test_全言語_全災害種別でガイドが組み立てられる(self, lang, disaster):
        guide = build_fallback_guide(disaster, lang)
        for field in GUIDE_FIELDS:
            assert guide[field], f"{lang}/{disaster} の {field} が空"
        assert guide["lang"] == lang
        assert guide["fallback"] is True
        assert guide["cached"] is False

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS))
    def test_プレースホルダが必ず置換される(self, lang):
        guide = build_fallback_guide("earthquake", lang)
        for text in _all_strings(guide):
            assert "{disaster}" not in text, f"{lang} でプレースホルダが残っている: {text}"

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS))
    def test_災害種別名がその言語で埋め込まれる(self, lang):
        expected = DISASTER_TYPES["tsunami"][lang]
        guide = build_fallback_guide("tsunami", lang)
        assert expected in guide["title"] or expected in guide["summary"], (
            f"{lang}: '{expected}' が title/summary に含まれない"
        )

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS - {"ja", "easy_ja"}))
    def test_日本語以外の言語で日本語のかなが混入しない(self, lang):
        """本修正の主目的。以前は全言語で日本語のガイドが返っていた。"""
        for text in _all_strings(build_fallback_guide("earthquake", lang)):
            assert not KANA.search(text), f"{lang} に日本語のかなが混入: {text}"

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS))
    def test_緊急連絡先に日本の番号が含まれる(self, lang):
        contacts = build_fallback_guide("earthquake", lang)["emergency_contacts"]
        for number in ("110", "119", "118", "050-3816-2787"):
            assert number in contacts, f"{lang} の連絡先に {number} が無い"


class TestFallbackOfFallback:
    @pytest.mark.parametrize("lang", ["ru", "pl", "klingon", "", None, "JA", "zh-tw"])
    def test_未対応言語は日本語ではなく英語に落ちる(self, lang):
        guide = build_fallback_guide("earthquake", lang)
        assert guide["lang"] == DEFAULT_LANG == "en"
        for text in _all_strings(guide):
            assert not KANA.search(text)

    def test_未知の災害種別でも例外にならず種別コードが入る(self):
        guide = build_fallback_guide("meteor_strike", "en")
        assert "meteor_strike" in guide["title"]
        for field in GUIDE_FIELDS:
            assert guide[field]

    def test_localized_disaster_name_は未知種別でコードを返す(self):
        assert localized_disaster_name("meteor_strike", "en") == "meteor_strike"

    def test_localized_disaster_name_は未対応言語で英語名を返す(self):
        assert localized_disaster_name("earthquake", "ru") == DISASTER_TYPES["earthquake"]["en"]


class TestResponseModel:
    """API レスポンスに fallback を載せるための配線ガード。

    `SafetyGuide` は main.py で明示フィールド指定して構築されるため、
    モデルにフィールドが無いと fallback 情報が黙って落ちる。
    """

    def test_SafetyGuide_に_fallback_フィールドがある(self):
        from app.models import SafetyGuide

        assert "fallback" in SafetyGuide.model_fields

    def test_fallback_の既定値は_False(self):
        from app.models import SafetyGuide

        guide = SafetyGuide(
            disaster_type="earthquake",
            severity="medium",
            language="en",
            title="t",
            summary="s",
            immediate_actions=["a"],
            preparation_tips=["p"],
            generated_at="2026-07-30T00:00:00",
        )
        assert guide.fallback is False

    def test_fallback_True_を保持できる(self):
        from app.models import SafetyGuide

        guide = SafetyGuide(
            disaster_type="earthquake",
            severity="medium",
            language="ko",
            title="t",
            summary="s",
            immediate_actions=["a"],
            preparation_tips=["p"],
            generated_at="2026-07-30T00:00:00",
            fallback=True,
        )
        assert guide.fallback is True


class TestIndependence:
    def test_返り値を書き換えても次回に影響しない(self):
        """テンプレートの list を共有していると、呼び出し側の変更が漏れる。"""
        first = build_fallback_guide("earthquake", "en")
        first["immediate_actions"].append("MUTATED")
        second = build_fallback_guide("earthquake", "en")
        assert "MUTATED" not in second["immediate_actions"]
