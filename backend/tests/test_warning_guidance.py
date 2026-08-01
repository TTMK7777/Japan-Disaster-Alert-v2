"""気象警報の行動ガイダンス（16言語・災害グループ方式）のテスト"""
import re

import pytest

from app.services.warning_guidance import (
    EMERGENCY_CODES,
    EMERGENCY_PREFIX,
    FALLBACK_LANG,
    HAZARD_ACTION,
    HAZARD_BY_CODE,
    resolve_guidance,
)
from app.services.warning_service import WarningService

# UI が対応している 16 言語
EXPECTED_LANGS = {
    "ja", "en", "zh", "zh-TW", "ko", "vi", "th", "id",
    "ms", "tl", "ne", "fr", "de", "it", "es", "easy_ja",
}

# ひらがな・カタカナ（カタカナ中黒 U+30FB は含めない）
KANA = re.compile(r"[ぁ-ゖァ-ヺー]")

PER_CODE = WarningService.WARNING_GUIDANCE


class TestCoverage:
    def test_全警報コードが災害グループに割り当てられている(self):
        """コードを追加してマッピングを忘れると、その言語で無言に英語へ落ちる。"""
        assert set(HAZARD_BY_CODE) == set(PER_CODE), (
            f"未割当: {set(PER_CODE) - set(HAZARD_BY_CODE)} / "
            f"存在しないコード: {set(HAZARD_BY_CODE) - set(PER_CODE)}"
        )

    def test_割当先のグループが実在する(self):
        for code, hazard in HAZARD_BY_CODE.items():
            assert hazard in HAZARD_ACTION, f"{code} の {hazard} が HAZARD_ACTION に無い"

    def test_全グループが16言語を持つ(self):
        for hazard, actions in HAZARD_ACTION.items():
            assert set(actions) == EXPECTED_LANGS, (
                f"{hazard} の欠け: {EXPECTED_LANGS - set(actions)}"
            )

    def test_特別警報の接頭語が16言語ある(self):
        assert set(EMERGENCY_PREFIX) == EXPECTED_LANGS

    def test_全グループ全言語の文面が空でない(self):
        for hazard, actions in HAZARD_ACTION.items():
            for lang, text in actions.items():
                assert text.strip(), f"{hazard}/{lang} が空"

    def test_特別警報コードが実在するコードである(self):
        assert EMERGENCY_CODES <= set(PER_CODE)


class TestResolve:
    @pytest.mark.parametrize("lang", ["ja", "en"])
    def test_ja_と_en_は既存のコード別文面をそのまま返す(self, lang):
        """既存挙動を劣化させないことの保証。"""
        for code in PER_CODE:
            assert resolve_guidance(code, lang, PER_CODE) == PER_CODE[code][lang]

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS))
    def test_全16言語_全コードでガイダンスが返る(self, lang):
        for code in PER_CODE:
            assert resolve_guidance(code, lang, PER_CODE).strip(), f"{code}/{lang} が空"

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS - {"ja", "en", "easy_ja"}))
    def test_ja_en_以外の言語で英語のままにならない(self, lang):
        """本修正の主目的。以前は14言語すべてが英語にフォールバックしていた。"""
        for code in PER_CODE:
            text = resolve_guidance(code, lang, PER_CODE)
            assert text != PER_CODE[code]["en"], f"{code}/{lang} が英語のまま"

    @pytest.mark.parametrize("lang", sorted(EXPECTED_LANGS - {"ja", "easy_ja"}))
    def test_日本語以外の言語で日本語のかなが混入しない(self, lang):
        for code in PER_CODE:
            text = resolve_guidance(code, lang, PER_CODE)
            assert not KANA.search(text), f"{code}/{lang} に日本語のかな: {text}"

    @pytest.mark.parametrize("code", sorted(EMERGENCY_CODES))
    @pytest.mark.parametrize("lang", ["ko", "th", "fr", "es"])
    def test_特別警報には緊急の接頭語が付く(self, code, lang):
        text = resolve_guidance(code, lang, PER_CODE)
        assert text.startswith(EMERGENCY_PREFIX[lang]), f"{code}/{lang}: {text}"

    @pytest.mark.parametrize("lang", ["ko", "th", "fr", "es"])
    def test_通常の警報には緊急の接頭語が付かない(self, lang):
        for code in set(PER_CODE) - EMERGENCY_CODES:
            text = resolve_guidance(code, lang, PER_CODE)
            assert not text.startswith(EMERGENCY_PREFIX[lang]), f"{code}/{lang}: {text}"

    def test_同じグループのコードは同じ文面になる(self):
        """グループ方式であることの明示。03 と 10 はどちらも大雨系。"""
        assert HAZARD_BY_CODE["03"] == HAZARD_BY_CODE["10"]
        assert resolve_guidance("03", "th", PER_CODE) == resolve_guidance("10", "th", PER_CODE)


class TestFallback:
    def test_未対応言語は英語のコード別文面に落ちる(self):
        assert resolve_guidance("03", "ru", PER_CODE) == PER_CODE["03"]["en"]

    def test_言語未指定は英語のコード別文面に落ちる(self):
        assert resolve_guidance("03", None, PER_CODE) == PER_CODE["03"][FALLBACK_LANG]

    def test_未知のコードは空文字を返す(self):
        assert resolve_guidance("99", "th", PER_CODE) == ""

    def test_コード別文面に言語を足すとグループより優先される(self):
        custom = {"03": {"en": "EN", "th": "PER-CODE THAI"}}
        assert resolve_guidance("03", "th", custom) == "PER-CODE THAI"


class TestWarningServiceWiring:
    """`_parse_warnings` に組み込まれていることの配線ガード。

    ここが `guidance.get(lang, guidance.get("en"))` に戻ると、
    14言語が黙って英語に戻る（テストが無ければ気付けない）。
    """

    @staticmethod
    def _payload(code: str) -> dict:
        """気象庁の実レスポンスと同じ形（`code` のみ / `name` は存在しない）。

        以前ここには `"name": "東京地方"` を書いていたが、実際の警報 JSON に
        `name` は入っていない。実在しないキーを前提にしたフィクスチャだったため、
        本番では地域名が出ていないことをテストが見逃していた。
        """
        return {
            "reportDatetime": "2026-07-30T12:00:00+09:00",
            "areaTypes": [
                {
                    "areas": [
                        {
                            "code": "130010",  # 東京地方
                            "warnings": [{"code": code, "status": "発表"}],
                        }
                    ]
                }
            ],
        }

    @pytest.mark.parametrize("lang", ["th", "ko", "fr", "es", "ne"])
    def test_翻訳後の説明にその言語のガイダンスが入る(self, lang):
        service = WarningService()
        alerts = service._parse_warnings(self._payload("03"), "130000", lang)

        assert len(alerts) == 1
        expected = resolve_guidance("03", lang, PER_CODE)
        assert expected in alerts[0].description_translated
        # 英語のコード別文面が出ていないこと（フォールバックに戻っていない）
        assert PER_CODE["03"]["en"] not in alerts[0].description_translated

    def test_日本語の説明は従来どおりコード別の日本語文面(self):
        service = WarningService()
        alerts = service._parse_warnings(self._payload("03"), "130000", "ja")

        assert len(alerts) == 1
        assert PER_CODE["03"]["ja"] in alerts[0].description
        # ja では translated を作らない既存挙動
        assert alerts[0].description_translated is None

    def test_英語は従来どおりコード別の英語文面(self):
        service = WarningService()
        alerts = service._parse_warnings(self._payload("03"), "130000", "en")

        assert PER_CODE["03"]["en"] in alerts[0].description_translated

    @pytest.mark.parametrize("lang", ["th", "ko"])
    def test_特別警報では緊急の接頭語が説明に入る(self, lang):
        service = WarningService()
        alerts = service._parse_warnings(self._payload("33"), "130000", lang)

        assert EMERGENCY_PREFIX[lang] in alerts[0].description_translated
