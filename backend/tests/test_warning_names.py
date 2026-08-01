"""気象警報の名称（16言語・合成方式）のテスト

`TestNoRegression` が本テストの中核。移行前に `warning_service.WARNING_CODES`
へ直接書かれていた6言語の文面を**そのまま凍結**し、合成結果と全件突合する。
これが緑である限り、既存ユーザーの表示は1文字も変わらない。
"""
import re

import pytest

from app.services.warning_names import (
    CODE_SPEC,
    DESCRIPTION_TEMPLATES,
    HAZARD_TERMS,
    LEVEL_TERMS,
    NAME_PATTERN,
    WARNING_NAMES,
)
from app.services.warning_service import WarningService

EXPECTED_LANGS = {
    "ja", "en", "zh", "zh-TW", "ko", "vi", "th", "id",
    "ms", "tl", "ne", "fr", "de", "it", "es", "easy_ja",
}

# ひらがな・カタカナ（カタカナ中黒 U+30FB は含めない）
KANA = re.compile(r"[ぁ-ゖァ-ヺー]")

# 移行前 (2026-07-30 以前) の warning_service.WARNING_CODES の内容を凍結。
# 合成方式に変えても既存6言語の表示が変わらないことを保証するための基準値。
FROZEN_BEFORE_MIGRATION: dict[str, dict[str, str]] = {
    "02": {"ja": "暴風雪警報", "en": "Blizzard Warning", "zh": "暴风雪警报", "ko": "폭풍설 경보", "vi": "Cảnh báo bão tuyết", "easy_ja": "ふぶき けいほう", "severity": "high"},
    "03": {"ja": "大雨警報", "en": "Heavy Rain Warning", "zh": "大雨警报", "ko": "호우 경보", "vi": "Cảnh báo mưa lớn", "easy_ja": "おおあめ けいほう", "severity": "high"},
    "04": {"ja": "洪水警報", "en": "Flood Warning", "zh": "洪水警报", "ko": "홍수 경보", "vi": "Cảnh báo lũ lụt", "easy_ja": "こうずい けいほう", "severity": "high"},
    "05": {"ja": "暴風警報", "en": "Storm Warning", "zh": "暴风警报", "ko": "폭풍 경보", "vi": "Cảnh báo bão", "easy_ja": "ぼうふう けいほう", "severity": "high"},
    "06": {"ja": "大雪警報", "en": "Heavy Snow Warning", "zh": "大雪警报", "ko": "대설 경보", "vi": "Cảnh báo tuyết lớn", "easy_ja": "おおゆき けいほう", "severity": "high"},
    "07": {"ja": "波浪警報", "en": "High Waves Warning", "zh": "海浪警报", "ko": "파랑 경보", "vi": "Cảnh báo sóng lớn", "easy_ja": "なみ けいほう", "severity": "high"},
    "08": {"ja": "高潮警報", "en": "Storm Surge Warning", "zh": "风暴潮警报", "ko": "해일 경보", "vi": "Cảnh báo triều cường", "easy_ja": "たかしお けいほう", "severity": "high"},
    "10": {"ja": "大雨注意報", "en": "Heavy Rain Advisory", "zh": "大雨注意报", "ko": "호우 주의보", "vi": "Chú ý mưa lớn", "easy_ja": "おおあめ ちゅういほう", "severity": "medium"},
    "12": {"ja": "大雪注意報", "en": "Heavy Snow Advisory", "zh": "大雪注意报", "ko": "대설 주의보", "vi": "Chú ý tuyết lớn", "easy_ja": "おおゆき ちゅういほう", "severity": "medium"},
    "13": {"ja": "風雪注意報", "en": "Wind Snow Advisory", "zh": "风雪注意报", "ko": "풍설 주의보", "vi": "Chú ý gió tuyết", "easy_ja": "ふうせつ ちゅういほう", "severity": "medium"},
    "14": {"ja": "雷注意報", "en": "Thunder Advisory", "zh": "雷电注意报", "ko": "뇌우 주의보", "vi": "Chú ý sấm sét", "easy_ja": "かみなり ちゅういほう", "severity": "medium"},
    "15": {"ja": "強風注意報", "en": "Strong Wind Advisory", "zh": "强风注意报", "ko": "강풍 주의보", "vi": "Chú ý gió mạnh", "easy_ja": "つよいかぜ ちゅういほう", "severity": "medium"},
    "16": {"ja": "波浪注意報", "en": "High Waves Advisory", "zh": "海浪注意报", "ko": "파랑 주의보", "vi": "Chú ý sóng lớn", "easy_ja": "なみ ちゅういほう", "severity": "medium"},
    "17": {"ja": "融雪注意報", "en": "Snowmelt Advisory", "zh": "融雪注意报", "ko": "융설 주의보", "vi": "Chú ý tan tuyết", "easy_ja": "ゆきどけ ちゅういほう", "severity": "medium"},
    "18": {"ja": "洪水注意報", "en": "Flood Advisory", "zh": "洪水注意报", "ko": "홍수 주의보", "vi": "Chú ý lũ lụt", "easy_ja": "こうずい ちゅういほう", "severity": "medium"},
    "19": {"ja": "高潮注意報", "en": "Storm Surge Advisory", "zh": "风暴潮注意报", "ko": "해일 주의보", "vi": "Chú ý triều cường", "easy_ja": "たかしお ちゅういほう", "severity": "medium"},
    "20": {"ja": "濃霧注意報", "en": "Dense Fog Advisory", "zh": "浓雾注意报", "ko": "짙은 안개 주의보", "vi": "Chú ý sương mù dày", "easy_ja": "きり ちゅういほう", "severity": "low"},
    "21": {"ja": "乾燥注意報", "en": "Dry Air Advisory", "zh": "干燥注意报", "ko": "건조 주의보", "vi": "Chú ý không khí khô", "easy_ja": "かんそう ちゅういほう", "severity": "low"},
    "22": {"ja": "なだれ注意報", "en": "Avalanche Advisory", "zh": "雪崩注意报", "ko": "눈사태 주의보", "vi": "Chú ý lở tuyết", "easy_ja": "なだれ ちゅういほう", "severity": "medium"},
    "23": {"ja": "低温注意報", "en": "Low Temperature Advisory", "zh": "低温注意报", "ko": "저온 주의보", "vi": "Chú ý nhiệt độ thấp", "easy_ja": "さむさ ちゅういほう", "severity": "low"},
    "24": {"ja": "霜注意報", "en": "Frost Advisory", "zh": "霜冻注意报", "ko": "서리 주의보", "vi": "Chú ý sương giá", "easy_ja": "しも ちゅういほう", "severity": "low"},
    "25": {"ja": "着氷注意報", "en": "Icing Advisory", "zh": "结冰注意报", "ko": "착빙 주의보", "vi": "Chú ý đóng băng", "easy_ja": "こおり ちゅういほう", "severity": "low"},
    "26": {"ja": "着雪注意報", "en": "Snow Accretion Advisory", "zh": "积雪注意报", "ko": "착설 주의보", "vi": "Chú ý tuyết bám", "easy_ja": "ゆき ちゅういほう", "severity": "low"},
    "32": {"ja": "暴風雪特別警報", "en": "Blizzard Emergency Warning", "zh": "暴风雪特别警报", "ko": "폭풍설 특별 경보", "vi": "Cảnh báo khẩn cấp bão tuyết", "easy_ja": "ふぶき とくべつけいほう", "severity": "extreme"},
    "33": {"ja": "大雨特別警報", "en": "Heavy Rain Emergency Warning", "zh": "大雨特别警报", "ko": "호우 특별 경보", "vi": "Cảnh báo khẩn cấp mưa lớn", "easy_ja": "おおあめ とくべつけいほう", "severity": "extreme"},
    "35": {"ja": "暴風特別警報", "en": "Storm Emergency Warning", "zh": "暴风特别警报", "ko": "폭풍 특별 경보", "vi": "Cảnh báo khẩn cấp bão", "easy_ja": "ぼうふう とくべつけいほう", "severity": "extreme"},
    "36": {"ja": "大雪特別警報", "en": "Heavy Snow Emergency Warning", "zh": "大雪特别警报", "ko": "대설 특별 경보", "vi": "Cảnh báo khẩn cấp tuyết lớn", "easy_ja": "おおゆき とくべつけいほう", "severity": "extreme"},
    "37": {"ja": "波浪特別警報", "en": "High Waves Emergency Warning", "zh": "海浪特别警报", "ko": "파랑 특별 경보", "vi": "Cảnh báo khẩn cấp sóng lớn", "easy_ja": "なみ とくべつけいほう", "severity": "extreme"},
    "38": {"ja": "高潮特別警報", "en": "Storm Surge Emergency Warning", "zh": "风暴潮特别警报", "ko": "해일 특별 경보", "vi": "Cảnh báo khẩn cấp triều cường", "easy_ja": "たかしお とくべつけいほう", "severity": "extreme"},
}


class TestNoRegression:
    """合成方式に変えても既存6言語の表示が1文字も変わらないこと。"""

    def test_コード集合が移行前と一致する(self):
        assert set(WARNING_NAMES) == set(FROZEN_BEFORE_MIGRATION)

    @pytest.mark.parametrize("code", sorted(FROZEN_BEFORE_MIGRATION))
    def test_移行前の全文面を再現する(self, code):
        before = FROZEN_BEFORE_MIGRATION[code]
        after = WARNING_NAMES[code]
        for key, expected in before.items():
            assert after[key] == expected, (
                f"{code}/{key}: 移行前 {expected!r} → 現在 {after[key]!r}"
            )

    def test_severity_が全コードで一致する(self):
        for code, before in FROZEN_BEFORE_MIGRATION.items():
            assert WARNING_NAMES[code]["severity"] == before["severity"]

    def test_warning_service_から参照される辞書が同一である(self):
        """`WARNING_CODES` の差し替えが効いていること。"""
        assert WarningService.WARNING_CODES is WARNING_NAMES


class TestCoverage:
    def test_全コードが16言語を持つ(self):
        for code, entry in WARNING_NAMES.items():
            langs = set(entry) - {"severity"}
            assert langs == EXPECTED_LANGS, f"{code} の欠け: {EXPECTED_LANGS - langs}"

    def test_全災害種別が16言語を持つ(self):
        for hazard, terms in HAZARD_TERMS.items():
            assert set(terms) == EXPECTED_LANGS, f"{hazard} の欠け: {EXPECTED_LANGS - set(terms)}"

    def test_全警報レベルが16言語を持つ(self):
        for level, terms in LEVEL_TERMS.items():
            assert set(terms) == EXPECTED_LANGS, f"{level} の欠け: {EXPECTED_LANGS - set(terms)}"

    def test_語順パターンが16言語ある(self):
        assert set(NAME_PATTERN) == EXPECTED_LANGS

    def test_説明文テンプレートが16言語ある(self):
        assert set(DESCRIPTION_TEMPLATES) == EXPECTED_LANGS

    def test_未使用の災害種別が無い(self):
        used = {hazard for hazard, _, _ in CODE_SPEC.values()}
        assert used == set(HAZARD_TERMS), f"未使用: {set(HAZARD_TERMS) - used}"

    def test_未使用の警報レベルが無い(self):
        used = {level for _, level, _ in CODE_SPEC.values()}
        assert used == set(LEVEL_TERMS), f"未使用: {set(LEVEL_TERMS) - used}"

    def test_全名称が空でない(self):
        for code, entry in WARNING_NAMES.items():
            for lang in EXPECTED_LANGS:
                assert entry[lang].strip(), f"{code}/{lang} が空"

    def test_全テンプレートにareaとwarningのプレースホルダがある(self):
        for lang, tmpl in DESCRIPTION_TEMPLATES.items():
            assert "{area}" in tmpl, f"{lang} に {{area}} が無い"
            assert "{warning}" in tmpl, f"{lang} に {{warning}} が無い"


class TestNewLanguages:
    NEW_LANGS = ["zh-TW", "th", "id", "ms", "tl", "ne", "fr", "de", "it", "es"]

    @pytest.mark.parametrize("lang", NEW_LANGS)
    def test_新規10言語で英語のままにならない(self, lang):
        """本修正の主目的。以前は10言語が英語名を表示していた。"""
        for code, entry in WARNING_NAMES.items():
            assert entry[lang] != entry["en"], f"{code}/{lang} が英語のまま"

    # 英語と綴りが同じでも正しい借用語。ここに無い一致は「翻訳し忘れ」として落とす。
    # (用語キー, 言語) の組で明示する。
    ALLOWED_ENGLISH_LOANWORDS = {
        ("blizzard", "fr"),
        ("blizzard", "tl"),
        ("avalanche", "fr"),
        ("avalanche", "tl"),
        ("storm_surge", "tl"),
        ("frost", "de"),  # ドイツ語の Frost は英語と同綴り
    }

    @pytest.mark.parametrize("lang", NEW_LANGS)
    def test_災害種別の語が英語のまま残っていない(self, lang):
        """名称全体は語順で違って見えるため、用語レベルで英語混入を検出する。

        `test_新規10言語で英語のままにならない` は名称全体の比較なので、
        「レベル語だけ訳して種別語が英語」のような部分的な訳し忘れを見逃す。
        """
        for hazard, terms in HAZARD_TERMS.items():
            if (hazard, lang) in self.ALLOWED_ENGLISH_LOANWORDS:
                continue
            assert terms[lang].casefold() != terms["en"].casefold(), (
                f"{hazard}/{lang} が英語のまま: {terms[lang]!r}"
                f"（正しい借用語なら ALLOWED_ENGLISH_LOANWORDS に追加）"
            )

    @pytest.mark.parametrize("lang", NEW_LANGS)
    def test_警報レベルの語が英語のまま残っていない(self, lang):
        for level, terms in LEVEL_TERMS.items():
            assert terms[lang].casefold() != terms["en"].casefold(), (
                f"{level}/{lang} が英語のまま: {terms[lang]!r}"
            )

    def test_許可リストが実際に英語と一致する組だけを含む(self):
        """許可リストが陳腐化して「実は違う語」を隠していないこと。"""
        for hazard, lang in self.ALLOWED_ENGLISH_LOANWORDS:
            terms = HAZARD_TERMS[hazard]
            assert terms[lang].casefold() == terms["en"].casefold(), (
                f"{hazard}/{lang} は英語と一致しないので許可リストから外せる"
            )

    @pytest.mark.parametrize("lang", NEW_LANGS)
    def test_新規10言語で日本語のかなが混入しない(self, lang):
        for code, entry in WARNING_NAMES.items():
            assert not KANA.search(entry[lang]), f"{code}/{lang}: {entry[lang]}"

    @pytest.mark.parametrize("lang", NEW_LANGS)
    def test_同一種別で警報と注意報の名称が異なる(self, lang):
        """レベル語が効いていること（大雨警報 と 大雨注意報 が同じになっていない）。"""
        assert WARNING_NAMES["03"][lang] != WARNING_NAMES["10"][lang]
        assert WARNING_NAMES["03"][lang] != WARNING_NAMES["33"][lang]

    @pytest.mark.parametrize("lang", NEW_LANGS)
    def test_同一レベルで災害種別の名称が異なる(self, lang):
        """種別語が効いていること（大雨警報 と 大雪警報 が同じになっていない）。"""
        assert WARNING_NAMES["03"][lang] != WARNING_NAMES["06"][lang]


class TestServiceIntegration:
    @staticmethod
    def _payload(code: str) -> dict:
        """気象庁の実レスポンスと同じ形（`code` のみ / `name` は存在しない）。"""
        return {
            "reportDatetime": "2026-07-30T12:00:00+09:00",
            "areaTypes": [
                {"areas": [{"code": "130010", "warnings": [{"code": code, "status": "発表"}]}]}
            ],
        }

    @pytest.mark.parametrize("lang", ["th", "fr", "es", "ne", "zh-TW"])
    def test_翻訳後のタイトルがその言語の警報名になる(self, lang):
        service = WarningService()
        alerts = service._parse_warnings(self._payload("03"), "130000", lang)

        assert len(alerts) == 1
        assert alerts[0].title_translated == WARNING_NAMES["03"][lang]
        assert alerts[0].title_translated != WARNING_NAMES["03"]["en"]

    @pytest.mark.parametrize("lang", ["th", "fr", "es"])
    def test_説明文もその言語のテンプレートで作られる(self, lang):
        service = WarningService()
        alerts = service._parse_warnings(self._payload("03"), "130000", lang)

        description = alerts[0].description_translated
        assert WARNING_NAMES["03"][lang] in description
        # 英語テンプレートの特徴的な語が混ざっていないこと
        assert "has been issued for" not in description

    def test_日本語のタイトルは従来どおり(self):
        service = WarningService()
        alerts = service._parse_warnings(self._payload("03"), "130000", "ja")
        assert alerts[0].title == "大雨警報"
