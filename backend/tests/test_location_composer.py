"""震源地名の合成翻訳。

静的辞書は完全名 82 件の丸暗記で、気象庁の震源地名 400 種余りに対して
未収録が多い。実データ 317 レポート（2026-08-25 取得）で測ると
**ユニークベース 44.8% が未収録**で、そのまま日本語が 15 言語すべてに出ていた。

このテストの要は下の `REAL_CORPUS` — 合成フィクスチャではなく
**実 API から取った震源地名そのもの**を焼き込んでいる。想像した形の入力で
緑になっても、実データに当てるまで検出器としては未検証（このリポジトリで
気象庁 API の形を 4 回続けて読み違えた前例がある）。
"""
import re

import pytest

from app.services.location_composer import (
    MODIFIERS,
    PLACE_TYPES,
    PLACES,
    QUALIFIER,
    RELATIONS,
    SUPPORTED_LANGS,
    compose,
    parse,
)
from app.services.location_translations import LOCATION_TRANSLATIONS, get_location_translation

LANGS = ["en", "zh", "zh-TW", "ko", "vi", "th", "id", "ms", "tl", "fr", "de", "it", "es", "ne", "easy_ja"]

#: 漢字・ひらがな・カタカナ。ラテン文字圏の言語にこれが残っていたら翻訳できていない
_CJK = re.compile(r"[぀-ヿ㐀-鿿]")

#: 日本語表記をそのまま出してよい言語
_KEEPS_CJK = frozenset({"zh", "zh-TW", "easy_ja"})

#: 実 API（P2P 地震情報 /history codes=551、直近 1000 件）から取得した
#: 震源地名とその出現回数。2026-08-25 時点のスナップショット。
#: 名前の顔ぶれは活動状況で入れ替わるので、被覆率の絶対値ではなく
#: 「実在した名前を落とさない」ことの固定に使う。
REAL_CORPUS: list[tuple[str, int]] = [
    ("熊本県熊本地方", 102), ("熊本県天草・芦北地方", 73), ("岩手県沖", 11), ("浦河沖", 7),
    ("宮古島近海", 4), ("茨城県北部", 4), ("天草灘", 4), ("福島県沖", 4),
    ("茨城県南部", 3), ("釧路沖", 3), ("鹿児島県薩摩地方", 3), ("和歌山県北部", 3),
    ("福岡県福岡地方", 3), ("日向灘", 3), ("石川県能登地方", 2), ("オホーツク海南部", 2),
    ("八丈島東方沖", 2), ("沖縄本島近海", 2), ("茨城県沖", 2), ("青森県東方沖", 2),
    ("滋賀県北部", 2), ("千葉県北西部", 2), ("釧路地方中南部", 1), ("房総半島南方沖", 1),
    ("日高地方東部", 1), ("大阪府北部", 1), ("十勝地方南部", 1), ("紀伊水道", 1),
    ("奄美大島北西沖", 1), ("硫黄島近海", 1), ("大阪湾", 1), ("台湾付近", 1),
    ("インドネシア、フローレス", 1), ("群馬県南部", 1), ("栃木県北部", 1), ("小笠原諸島西方沖", 1),
    ("豊後水道", 1), ("千葉県北東部", 1), ("能登半島沖", 1), ("日高地方西部", 1),
    ("岐阜県美濃東部", 1), ("鳥取県中部", 1), ("新潟県中越地方", 1), ("長野県南部", 1),
    ("コロンビア", 1), ("網走地方", 1), ("奈良県", 1), ("大分県中部", 1),
    ("安芸灘", 1), ("千葉県東方沖", 1), ("岩手県沿岸北部", 1), ("和歌山県南部", 1),
    ("大分県西部", 1), ("岐阜県飛騨地方", 1), ("福井県嶺北", 1), ("三陸沖", 1),
    ("大隅半島東方沖", 1), ("宮城県沖", 1),
]


def resolve(name: str, lang: str) -> str | None:
    """本番と同じ優先順（手訳の辞書 → 合成）で引く。"""
    return get_location_translation(name, lang) or compose(name, lang)


class TestRealCorpus:
    """実データの震源地名を全言語で解決できること。"""

    @pytest.mark.parametrize("lang", LANGS)
    def test_実データの全名称を解決できる(self, lang):
        unresolved = [name for name, _ in REAL_CORPUS if resolve(name, lang) is None]
        assert unresolved == [], f"{lang} で解決できない: {unresolved}"

    @pytest.mark.parametrize("lang", sorted(set(LANGS) - _KEEPS_CJK))
    def test_ラテン文字圏に日本語が残らない(self, lang):
        leaked = []
        for name, _ in REAL_CORPUS:
            result = resolve(name, lang)
            if result and _CJK.search(result):
                leaked.append((name, result))
        assert leaked == [], f"{lang} に日本語が残っている: {leaked}"

    @pytest.mark.parametrize("lang", LANGS)
    def test_出現回数で重みづけしても取りこぼしがない(self, lang):
        total = sum(count for _, count in REAL_CORPUS)
        covered = sum(count for name, count in REAL_CORPUS if resolve(name, lang))
        assert covered == total, f"{lang}: {covered}/{total} しか解決できていない"

    @pytest.mark.parametrize("lang", LANGS)
    def test_空文字を返さない(self, lang):
        for name, _ in REAL_CORPUS:
            result = resolve(name, lang)
            assert result and result.strip(), f"{lang} / {name} が空"


class TestParsing:
    """語順どおりに分解できること。"""

    @pytest.mark.parametrize(
        "name,expected",
        [
            ("福島県沖", ("福島県", "", "", "", "沖")),
            ("滋賀県北部", ("滋賀県", "", "", "北部", "")),
            ("石川県能登地方", ("石川県", "能登", "地方", "", "")),
            ("岐阜県美濃東部", ("岐阜県", "美濃", "", "東部", "")),
            ("福井県嶺北", ("福井県", "嶺北", "", "", "")),
            ("房総半島南方沖", ("", "房総", "半島", "", "南方沖")),
            ("釧路地方中南部", ("", "釧路", "地方", "中南部", "")),
            ("大阪湾", ("", "大阪", "湾", "", "")),
            ("岩手県沿岸北部", ("岩手県", "", "", "沿岸北部", "")),
            ("熊本県天草・芦北地方", ("熊本県", "天草・芦北", "地方", "", "")),
            ("小笠原諸島西方沖", ("", "小笠原", "諸島", "", "西方沖")),
        ],
    )
    def test_分解の形(self, name, expected):
        assert tuple(parse(name)) == expected

    def test_慣用の融合名は割らない(self):
        # "奄美大" + "島" のように割ると英名が壊れる
        assert parse("奄美大島北西沖").base == "奄美大島"
        assert parse("奄美大島北西沖").place_type == ""
        assert parse("硫黄島近海").base == "硫黄島"
        assert parse("父島近海").base == "父島"

    def test_長い接尾語を先に取る(self):
        # 「東方沖」を「沖」と取ると「八丈島東方」が残って壊れる。
        # これを担保しているのは選択肢の並び順ではなく search の最左マッチ
        # （並び順を逆にするミューテーションは素通りする）
        assert parse("八丈島東方沖").relation == "東方沖"
        # 「沿岸北部」を「北部」と取ると「岩手県沿岸」が残る
        assert parse("岩手県沿岸北部").modifier == "沿岸北部"
        assert parse("小笠原諸島西方沖").place_type == "諸島"

    @pytest.mark.parametrize("name", ["", "   ", "沖", "北部", "地方"])
    def test_地名が無ければ分解しない(self, name):
        assert parse(name) is None

    def test_未知の地名でも分解自体はできる(self):
        parsed = parse("架空県北部")
        assert parsed is not None
        assert parsed.modifier == "北部"


class TestCompose:
    def test_組み立てられない名前はNoneになる(self):
        # 表に無い固有名詞は日本語のまま返させる（中途半端に訳さない）
        assert compose("架空県北部", "en") is None
        assert compose("まったく未知の場所", "en") is None

    def test_対応していない言語はNoneになる(self):
        assert compose("福島県沖", "ja") is None
        assert compose("福島県沖", "sw") is None

    @pytest.mark.parametrize(
        "name,lang,expected",
        [
            # 手訳の辞書と完全一致する例。表の中身が正しいことの裏付けになる
            ("茨城県北部", "en", "Northern Ibaraki Prefecture"),
            ("福島県沖", "en", "Off the coast of Fukushima Prefecture"),
            ("石川県能登地方", "en", "Noto Region, Ishikawa Prefecture"),
            ("東京湾", "en", "Tokyo Bay"),
            ("宮古島近海", "en", "Near Miyako Island"),
            ("沖縄本島近海", "en", "Near Okinawa Main Island"),
            ("茨城県北部", "fr", "Nord de la préfecture d'Ibaraki"),
            ("福島県沖", "fr", "Au large de la préfecture de Fukushima"),
            ("石川県能登地方", "fr", "Région de Noto, préfecture d'Ishikawa"),
            ("茨城県北部", "es", "Norte de la prefectura de Ibaraki"),
            ("茨城県北部", "zh", "茨城县北部"),
            ("茨城県北部", "ko", "이바라키현 북부"),
        ],
    )
    def test_手訳と同じ結果になる(self, name, lang, expected):
        assert compose(name, lang) == expected

    def test_フランス語のエリジオン(self):
        # 母音の前は d'、子音の前は de
        assert "d'Ibaraki" in compose("茨城県北部", "fr")
        assert "de Fukushima" in compose("福島県沖", "fr")
        assert compose("熊本県天草・芦北地方", "fr").startswith("Région d'Amakusa")

    def test_スペイン語の縮約(self):
        # de + el は del になる
        result = compose("オホーツク海南部", "es")
        assert "de el " not in result
        assert "del mar" in result

    def test_イタリア語の縮約(self):
        result = compose("房総半島南方沖", "it")
        assert "di la " not in result
        assert "della penisola" in result

    def test_文頭が大文字になる(self):
        for lang in ["en", "fr", "es", "it", "de", "vi", "id", "ms", "tl"]:
            result = compose("東京湾", lang)
            assert result[0].isupper(), f"{lang}: {result}"

    def test_大文字化で二文字目以降を潰さない(self):
        # str.capitalize() を使うと "Tokyo Bay" が "Tokyo bay" になる
        assert compose("東京湾", "en") == "Tokyo Bay"

    def test_外名を音訳より優先する(self):
        assert compose("東京湾", "de") == "Bucht von Tokio"
        assert compose("東京湾", "es") == "La bahía de Tokio"
        assert compose("東京湾", "en") == "Tokyo Bay"

    def test_遠地地震の読点区切り(self):
        assert compose("インドネシア、フローレス", "en") == "Indonesia, Flores"
        assert compose("インドネシア、フローレス", "zh") == "印度尼西亚、弗洛勒斯"

    def test_読点の片側が未知なら全体を諦める(self):
        assert compose("インドネシア、架空の島", "en") is None

    def test_地形語を訳し分ける(self):
        # ラテン系言語に "Peninsula" が英語のまま残らないこと
        assert "péninsule" in compose("房総半島南方沖", "fr")
        assert "Halbinsel" in compose("房総半島南方沖", "de")
        assert "península" in compose("房総半島南方沖", "es")
        assert "bán đảo" in compose("房総半島南方沖", "vi")
        assert "Peninsula" in compose("房総半島南方沖", "en")


class TestTableIntegrity:
    """表の穴を機械的に見つける。1 言語でも欠けると本番でその言語だけ日本語に落ちる。"""

    @pytest.mark.parametrize("table_name", ["MODIFIERS", "PLACE_TYPES", "RELATIONS"])
    def test_全テンプレートが15言語を持つ(self, table_name):
        table = {"MODIFIERS": MODIFIERS, "PLACE_TYPES": PLACE_TYPES, "RELATIONS": RELATIONS}[table_name]
        missing = [
            (key, lang) for key, langs in table.items() for lang in LANGS if not langs.get(lang)
        ]
        assert missing == [], f"{table_name} に欠けがある: {missing}"

    @pytest.mark.parametrize("table_name", ["MODIFIERS", "PLACE_TYPES", "RELATIONS"])
    def test_全テンプレートが地名を差し込む(self, table_name):
        table = {"MODIFIERS": MODIFIERS, "PLACE_TYPES": PLACE_TYPES, "RELATIONS": RELATIONS}[table_name]
        broken = [
            (key, lang) for key, langs in table.items()
            for lang, tmpl in langs.items() if "{place}" not in tmpl
        ]
        assert broken == [], f"{table_name} に地名の差し込み口が無い: {broken}"

    def test_限定句が全言語ぶんある(self):
        missing = [lang for lang in LANGS if not QUALIFIER.get(lang)]
        assert missing == []
        broken = [lang for lang, t in QUALIFIER.items() if "{core}" not in t or "{pref}" not in t]
        assert broken == []

    def test_全ての地名が必要な表記を持つ(self):
        missing = [
            (ja, key) for ja, entry in PLACES.items()
            for key in ("latin", "zh", "zh-TW", "ko", "kana", "kind")
            if not entry.get(key)
        ]
        assert missing == [], f"表記が欠けている: {missing}"

    def test_都道府県が47件そろっている(self):
        prefs = [k for k, v in PLACES.items() if k[-1] in "都道府県" and len(k) >= 3]
        assert len(prefs) == 47, f"{len(prefs)} 件しかない: {sorted(prefs)}"

    def test_ラテン表記に日本語が混ざっていない(self):
        bad = [(ja, e["latin"]) for ja, e in PLACES.items() if _CJK.search(e["latin"])]
        assert bad == [], f"latin に日本語: {bad}"

    def test_かな表記が漢字を含まない(self):
        kanji = re.compile(r"[㐀-鿿]")
        bad = [(ja, e["kana"]) for ja, e in PLACES.items() if kanji.search(e["kana"])]
        assert bad == [], f"easy_ja 用のかなに漢字が残っている: {bad}"

    def test_対応言語が15件(self):
        assert SUPPORTED_LANGS == frozenset(LANGS)


class TestPriority:
    """手訳の辞書が常に勝つこと。合成の導入で既存の訳が変わってはいけない。"""

    @pytest.mark.parametrize("lang", LANGS)
    def test_手訳がある名前は手訳のまま(self, lang):
        changed = []
        for ja, translations in LOCATION_TRANSLATIONS.items():
            want = translations.get(lang)
            if not want:
                continue
            if resolve(ja, lang) != want:
                changed.append(ja)
        assert changed == [], f"{lang} で手訳が上書きされた: {changed}"


class TestGroundTruthAgainstCuratedEntries:
    """手訳 82 件を正解データとして、表の固有名詞が正しいかを見る。

    完全一致までは求めない（"Off Tokachi" と "Off the coast of Tokachi" のような
    言い回しの差は誤りではない）。見たいのは**地名そのもの**が一致するかで、
    ここがずれていたら漢字・ハングル・音訳のどれかが間違っている。
    """

    @pytest.mark.parametrize("lang", ["en", "zh-TW", "ko", "easy_ja"])
    def test_地名トークンが手訳の中に現れる(self, lang):
        mismatches = []
        for ja, translations in LOCATION_TRANSLATIONS.items():
            want = translations.get(lang)
            parsed = parse(ja) if want else None
            if not parsed:
                continue
            for token_ja in (parsed.prefecture, parsed.base):
                if not token_ja or token_ja not in PLACES:
                    continue
                entry = PLACES[token_ja]
                core = entry["kana"] if lang == "easy_ja" else entry.get(lang, entry["latin"])
                if core not in want:
                    mismatches.append((ja, token_ja, core, want))
        # 言い回しの差で数件は外れる。半分以上外れるなら表が壊れている
        total = sum(1 for ja, t in LOCATION_TRANSLATIONS.items() if t.get(lang) and parse(ja))
        assert len(mismatches) < total * 0.3, f"{lang}: {len(mismatches)}/{total} 不一致 {mismatches[:5]}"


class TestWiredIntoTranslator:
    """本番の入口を通ること。

    合成器そのものが正しくても、TranslatorService.translate_location から
    呼ばれていなければ利用者には何も届かない。合成器を直接叩くテストだけでは
    配線が外れても緑のままになる（実際にミューテーションで素通りした）。
    """

    @pytest.fixture
    def translator(self):
        from app.services.translator import TranslatorService

        return TranslatorService()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("lang", ["en", "fr", "zh", "ko", "vi"])
    async def test_手訳に無い名前が翻訳されて返る(self, translator, lang):
        # 静的辞書に無く、合成でしか解決できない名前
        name = "滋賀県北部"
        assert get_location_translation(name, lang) is None, "前提が崩れている"
        result = await translator.translate_location(name, lang)
        assert result != name, f"{lang}: 日本語のまま返っている"
        assert result == compose(name, lang)

    @pytest.mark.asyncio
    async def test_日本語指定では原文のまま返る(self, translator):
        assert await translator.translate_location("滋賀県北部", "ja") == "滋賀県北部"

    @pytest.mark.asyncio
    async def test_合成できない名前は原文のまま返る(self, translator):
        # AI が未設定の環境では日本語へフォールバックする
        assert await translator.translate_location("架空県北部", "en") == "架空県北部"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("lang", ["en", "fr", "es", "vi", "th", "ne"])
    async def test_実データ全件が本番経路で日本語のまま出ない(self, lang):
        from app.services.translator import TranslatorService

        service = TranslatorService()
        leaked = []
        for name, _ in REAL_CORPUS:
            result = await service.translate_location(name, lang)
            if _CJK.search(result):
                leaked.append((name, result))
        assert leaked == [], f"{lang} で日本語が残った: {leaked}"


class TestPrefectureFromMunicipality:
    """市町村名から都道府県だけを取り出して訳す（噴火警報の対象地域で使う）。

    市町村は全国 1700 以上あって訳を持てないが、訪日客に必要なのは
    「どの都道府県か」の粒度。畳めない名前は None にして日本語を残さない。
    """

    def test_市町村名から都道府県を訳す(self):
        from app.services.location_composer import localize_prefecture

        assert localize_prefecture("熊本県阿蘇市", "en") == "Kumamoto Prefecture"
        assert localize_prefecture("鹿児島県三島村", "en") == "Kagoshima Prefecture"
        assert localize_prefecture("北海道美瑛町", "en") == "Hokkaido"

    def test_冠詞を落として文頭を大文字にする(self):
        from app.services.location_composer import localize_prefecture

        # 単独で並べるので "la préfecture de …" ではなく "Préfecture de …"
        assert localize_prefecture("熊本県阿蘇市", "fr") == "Préfecture de Kumamoto"
        assert localize_prefecture("岩手県雫石町", "fr") == "Préfecture d'Iwate"
        assert localize_prefecture("熊本県阿蘇市", "es") == "Prefectura de Kumamoto"

    def test_漢字圏とかな(self):
        from app.services.location_composer import localize_prefecture

        assert localize_prefecture("熊本県阿蘇市", "zh") == "熊本县"
        assert localize_prefecture("熊本県阿蘇市", "ko") == "구마모토현"
        assert localize_prefecture("熊本県阿蘇市", "easy_ja") == "くまもとけん"

    def test_都道府県で始まらない名前はNone(self):
        from app.services.location_composer import localize_prefecture

        assert localize_prefecture("小笠原村", "en") is None
        assert localize_prefecture("", "en") is None
        assert localize_prefecture("架空県某市", "en") is None
