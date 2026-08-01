"""地域名の多言語解決の回帰テスト

## 背景（2026-08-01）

気象庁の警報 JSON には地域名が入っていない。`areaTypes[].areas[]` の中身は
`code` と `warnings` だけで、`name` キーは存在しない
（東京 130000 / 沖縄 471000 の実レスポンスで確認）。

にもかかわらず実装は `area.get("name", "") or prefecture_name` と書いていたため、
**全16言語で都道府県名（日本語）が表示されていた**。日本語名をキーにした
旧 `AREA_TRANSLATIONS`（4地域×5言語）は一度も引かれない死蔵コードだった。

このテストは以下を固定する:
  1. 地名がコードから解決されること
  2. 日本語以外の言語に日本語が漏れないこと
  3. レビュー済みのオーバーライドが公式名より優先されること
"""
import pytest

from app.models import ALLOWED_LANGUAGES
from app.services.area_display import (
    AREA_NAME_OVERRIDES,
    JAPANESE_LANGS,
    is_known_area,
    resolve_area_name,
)
from app.services.area_names import AREA_NAMES, FORECAST_OFFICE_CODES

# 実際の警報 JSON に現れることを確認済みのコード
TOKYO_REGION = "130010"
OKINAWA_MAIN_SOUTH = "471010"

NON_JAPANESE_LANGS = sorted(ALLOWED_LANGUAGES - JAPANESE_LANGS)

#: 漢字を使う言語。中国語の地名は漢字なので、字種では日本語と区別できない
#: （「东京地区」は漢字だが中国語として正しい）。この2言語は字種で判定しない。
CJK_LANGS = frozenset({"zh", "zh-TW"})


def _has_cjk(text: str) -> bool:
    """ひらがな・カタカナ・漢字が含まれるか。"""
    return any(
        "぀" <= ch <= "ゟ"  # ひらがな
        or "゠" <= ch <= "ヿ"  # カタカナ
        or "一" <= ch <= "鿿"  # 漢字
        for ch in text
    )


class TestMasterTable:
    """生成されたマスタが健全であること"""

    def test_マスタが空でない(self):
        assert len(AREA_NAMES) > 150

    def test_全エントリが日本語名と英語名を持つ(self):
        for code, entry in AREA_NAMES.items():
            assert entry.get("ja"), f"{code} に日本語名が無い"
            assert entry.get("en"), f"{code} に英語名が無い"

    def test_英語名に日本語が混ざっていない(self):
        leaked = {c: e["en"] for c, e in AREA_NAMES.items() if _has_cjk(e["en"])}
        assert not leaked, f"英語名に日本語が残っている: {leaked}"

    def test_予報区コードは全てマスタに載っている(self):
        missing = sorted(FORECAST_OFFICE_CODES - set(AREA_NAMES))
        assert not missing, f"予報区なのに地名が引けない: {missing}"

    @pytest.mark.parametrize(
        "code,expected_ja",
        [
            (TOKYO_REGION, "東京地方"),
            (OKINAWA_MAIN_SOUTH, "本島中南部"),
            ("130000", "東京都"),
        ],
    )
    def test_実データのコードが期待どおりの地名になる(self, code, expected_ja):
        assert AREA_NAMES[code]["ja"] == expected_ja


class TestResolveAreaName:
    @pytest.mark.parametrize("lang", sorted(ALLOWED_LANGUAGES))
    def test_全言語で空文字にならない(self, lang):
        assert resolve_area_name(TOKYO_REGION, lang).strip()

    @pytest.mark.parametrize("lang", NON_JAPANESE_LANGS)
    def test_日本語以外の言語で日本語名がそのまま出ない(self, lang):
        """**これが本件の中核。** 修正前は全言語で日本語名がそのまま出ていた。

        字種では判定しない。中国語の地名は漢字なので日本語と区別できないため、
        「公式の日本語名と文字列が違うこと」で判定する。
        """
        official_ja = AREA_NAMES[OKINAWA_MAIN_SOUTH]["ja"]
        name = resolve_area_name(OKINAWA_MAIN_SOUTH, lang)
        assert name != official_ja, f"{lang} に日本語名がそのまま出た: {name}"

    @pytest.mark.parametrize(
        "lang", [l for l in NON_JAPANESE_LANGS if l not in CJK_LANGS]
    )
    def test_漢字を使わない言語にCJKが混ざらない(self, lang):
        name = resolve_area_name(OKINAWA_MAIN_SOUTH, lang)
        assert not _has_cjk(name), f"{lang} に CJK が混ざった: {name}"

    @pytest.mark.parametrize("lang", sorted(JAPANESE_LANGS))
    def test_日本語系の言語は日本語名になる(self, lang):
        assert resolve_area_name(OKINAWA_MAIN_SOUTH, lang) == "本島中南部"

    def test_オーバーライドが公式名より優先される(self):
        assert resolve_area_name(TOKYO_REGION, "ko") == "도쿄 지역"
        assert resolve_area_name(TOKYO_REGION, "zh") == "东京地区"

    def test_easy_ja_はオーバーライドがあればかなになる(self):
        assert resolve_area_name(TOKYO_REGION, "easy_ja") == "とうきょう"

    def test_オーバーライドが無い言語は公式英語名になる(self):
        assert resolve_area_name(TOKYO_REGION, "fr") == "Tokyo Region"

    def test_全オーバーライドのコードがマスタに存在する(self):
        """コードを打ち間違えると黙って無視される（旧実装と同じ死蔵になる）。"""
        unknown = sorted(set(AREA_NAME_OVERRIDES) - set(AREA_NAMES))
        assert not unknown, f"マスタに無いコードのオーバーライド: {unknown}"

    def test_未知のコードはフォールバックを返す(self):
        assert resolve_area_name("9999999", "en", "Tokyo") == "Tokyo"

    def test_未知のコードでフォールバックも無ければコードを返す(self):
        assert resolve_area_name("9999999", "en") == "9999999"


class TestIsKnownArea:
    def test_一次細分区域は既知(self):
        assert is_known_area(TOKYO_REGION)

    def test_府県予報区も既知(self):
        assert is_known_area("130000")

    def test_市町村コードは対象外(self):
        """警報 JSON の areaTypes[1] は7桁の市町村コード。表示には使わない。"""
        assert not is_known_area("4720100")
