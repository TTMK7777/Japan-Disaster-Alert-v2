"""地域コードを利用者の言語で読める地名に変換する。

## なぜコード起点なのか

気象庁の警報 JSON（`/bosai/warning/data/warning/{code}.json`）の
`areaTypes[].areas[]` には **`code` しか入っていない**。`name` キーは存在しない
（2026-08-01 に東京 130000 / 沖縄 471000 の実レスポンスで確認）。

以前の実装は `area.get("name", "") or prefecture_name` と書いており、
`name` が常に空なので **どの言語でも都道府県名（日本語）が出ていた**。
日本語名をキーにした旧 `AREA_TRANSLATIONS` は一度も引かれていない死蔵コードだった
（キーが「東京地方」なのに、実際に渡る値は「東京都」だったため）。

そのため、地名はコードから `area_names.AREA_NAMES`（気象庁公式マスタの生成物）を引く。

## 言語の方針

| 言語 | 出すもの |
|------|---------|
| `ja` / `easy_ja` | 日本語名（`easy_ja` はオーバーライドにかなが有ればそれ） |
| その他の14言語 | 気象庁公式の `enName` |

**14言語ぶんの地名を機械的に量産しない**のは意図的な判断である。
193 地域 × 14 言語 = 2,702 件の固有名詞を無レビューで作ると、
誤訳が「どこに避難するか」の判断を誤らせる。警報名を合成方式にしたときと同じ理由。

英語名に寄せるのは妥協ではなく実利がある。駅名・道路標識・避難所の看板は
ローマ字併記なので、**現地で目にする文字列と照合できる**。

個別に精度を上げたい地域は `AREA_NAME_OVERRIDES` に足す。オーバーライドは公式名より優先される。
"""
from __future__ import annotations

from .area_names import AREA_NAMES, OFFICES_BY_PREFECTURE

#: 日本語をそのまま出す言語
JAPANESE_LANGS = frozenset({"ja", "easy_ja"})

#: 公式マスタより優先する訳。旧 `AREA_TRANSLATIONS` をコード起点に移設したもの。
#:
#: `en` は移設していない。旧値の 4 件中 3 件は公式 `enName` と完全一致しており
#: （Northern Izu Islands / Southern Izu Islands / Ogasawara Islands）、
#: 残る 1 件も "Tokyo Area" と "Tokyo Region" の差でしかない。
#: 193 地域で表記を揃える方が利用者には読みやすいので公式名に統一した。
AREA_NAME_OVERRIDES: dict[str, dict[str, str]] = {
    "130010": {  # 東京地方
        "zh": "东京地区",
        "ko": "도쿄 지역",
        "vi": "Khu vực Tokyo",
        "easy_ja": "とうきょう",
    },
    "130020": {  # 伊豆諸島北部
        "zh": "伊豆诸岛北部",
        "ko": "이즈 제도 북부",
        "vi": "Bắc quần đảo Izu",
        "easy_ja": "いずしょとう きたぶ",
    },
    "130030": {  # 伊豆諸島南部
        "zh": "伊豆诸岛南部",
        "ko": "이즈 제도 남부",
        "vi": "Nam quần đảo Izu",
        "easy_ja": "いずしょとう みなみぶ",
    },
    "130040": {  # 小笠原諸島
        "zh": "小笠原诸岛",
        "ko": "오가사와라 제도",
        "vi": "Quần đảo Ogasawara",
        "easy_ja": "おがさわらしょとう",
    },
}


def is_known_area(code: str) -> bool:
    """表示に使えるコードか（府県予報区または一次細分区域）。

    警報 JSON の `areaTypes[1]` は市町村（7桁）で、そこは収録していないので False になる。
    """
    return code in AREA_NAMES


def expand_to_offices(area_code: str) -> tuple[str, ...]:
    """都道府県を代表するコードを、その都道府県の府県予報区すべてに広げる。

    気象庁の警報 API は府県予報区ごとに分かれており、**「1 都道府県 = 1 予報区」ではない**。
    北海道は 8、沖縄は 4、鹿児島は 2 に分かれている。代表コードだけを見ていたため、
    北海道は石狩・空知・後志だけ、沖縄は本島だけになり、
    **宮古島・八重山（主要な観光地）や奄美の警報には到達できていなかった**。

    Args:
        area_code: 予報区コード。都道府県の代表コードなら兄弟の予報区に広がる。

    Returns:
        取得すべき予報区コードの一覧。予報区でないコード（一次細分区域など）や
        未知のコードはそのまま1件で返す。
    """
    offices = OFFICES_BY_PREFECTURE.get(area_code[:2])
    if not offices or area_code not in offices:
        return (area_code,)
    return offices


def all_forecast_offices() -> tuple[str, ...]:
    """全国の府県予報区コード（58件）。全国スキャンはこれを回す。"""
    return tuple(
        code for codes in OFFICES_BY_PREFECTURE.values() for code in codes
    )


def resolve_area_name(code: str, lang: str, fallback: str = "") -> str:
    """地域コードを指定言語の地名にする。

    Args:
        code: 気象庁の地域コード（例 "130010"）
        lang: 言語コード
        fallback: コードが未知だったときに返す文字列（通常は都道府県名）

    Returns:
        その言語で読める地名。未知のコードで fallback も空なら code をそのまま返す。
    """
    override = AREA_NAME_OVERRIDES.get(code, {})
    if lang in override:
        return override[lang]

    entry = AREA_NAMES.get(code)
    if entry is None:
        return fallback or code

    if lang in JAPANESE_LANGS:
        return entry["ja"]
    # 公式 enName。マスタ側が空のときだけ日本語に落とす（現状 0 件）
    return entry["en"] or entry["ja"]
