# -*- coding: utf-8 -*-
"""震源地名を形態から組み立てて翻訳する。

## なぜ必要か

`location_translations.LOCATION_TRANSLATIONS` は**完全名 82 件の丸暗記**で、
気象庁の震源地名（400 種余り）に対して被覆が足りない。実データ 317 レポートで測ると
**ユニークベース 44.8%、出現ベース 37.1% が未収録**で、そのまま日本語が
15 言語すべてに出ていた。辞書に足す運用は名前が入れ替わるたびに破綻する。

## 気象庁の震源地名は形態が規則的

    [都道府県] [基底地名] [地形語] [修飾語] [位置関係]

    福島県沖             = 福島県 +           +      +        + 沖
    滋賀県北部           = 滋賀県 +           +      + 北部
    石川県能登地方       = 石川県 + 能登      + 地方
    岐阜県美濃東部       = 岐阜県 + 美濃      +      + 東部
    福井県嶺北           = 福井県 + 嶺北
    房総半島南方沖       =        + 房総      + 半島 +        + 南方沖
    釧路地方中南部       =        + 釧路      + 地方 + 中南部
    大阪湾               =        + 大阪      + 湾
    岩手県沿岸北部       = 岩手県 +           +      + 沿岸北部

そこで地名そのもの（固有名詞）と、構造を表す語（地形・方角・位置関係）を分けて持ち、
言語ごとのテンプレートで組み立てる。構造語は 15 言語ぶん用意しても
「北」「沖」「湾」といった一般語彙なので、固有名詞を訳し下ろすより安全。

地形語を固有名詞に含めない（`房総半島` ではなく `房総` + `半島`）のは、
ラテン系言語が地形語を訳し分けるため。焼き込むと "Au large de la Boso Peninsula" のように
英語が仏文へ混入する（既存訳は "péninsule de Boso" と書いている）。
ただし `奄美大島` `硫黄島` `父島` のように慣用の英名が融合しているものは
分解せず `PLACES` に完全形で持ち、分解より先に照合する。

## 既存の 82 件との関係

**完全一致の辞書が常に優先**する（`translator.translate_location` の 1 段目）。
本モジュールはその次に来る。したがって既存の訳は 1 件も変わらない。
さらに 82 件は**正解データとして使える** — 分解できるものについては、
ここで組み立てた結果に既存訳と同じ地名トークンが現れるはずで、
`tests/test_location_composer.py` がそれを固定している。

## th と ne の固有名詞について

既存の 82 件はタイ文字・デーヴァナーガリーで音訳している（อิบารากิ / इबाराकी）。
本モジュールが新たに組み立てる名前については **ラテン文字の音訳をそのまま置く**。
未検証の音訳を 100 件規模で作り足すより、読める文字で出す方が実害が小さいと判断した
（訪日客が実際に目にする駅名標・道路標識もラテン文字併記のため）。
構造語（「〜の北部」「〜沖」）はタイ語・ネパール語で書く。
ネイティブ確認が取れた時点で `PLACES` に該当言語のキーを足せば上書きできる。
"""
from __future__ import annotations

import re
from typing import NamedTuple, Optional

# ----------------------------------------------------------------------
# 固有名詞
# ----------------------------------------------------------------------
# latin: ラテン文字の音訳。en / vi / id / ms / tl / fr / de / it / es と、
#        暫定的に th / ne でも使う（モジュール冒頭の注記を参照）
# zh / zh-TW / ko / kana: それぞれの表記。都・道・府 の別があるため
#        接尾語をここで計算せず、完全な形で持つ
# kind:  "pref" なら、ラテン系言語で「県」に当たる語を付ける。"area" なら付けない
_P = "pref"
_A = "area"

PLACES: dict[str, dict[str, str]] = {
    # ---- 都道府県 ----
    "北海道": {"latin": "Hokkaido", "zh": "北海道", "zh-TW": "北海道", "ko": "홋카이도", "kana": "ほっかいどう", "kind": _A},
    "青森県": {"latin": "Aomori", "zh": "青森县", "zh-TW": "青森縣", "ko": "아오모리현", "kana": "あおもりけん", "kind": _P},
    "岩手県": {"latin": "Iwate", "zh": "岩手县", "zh-TW": "岩手縣", "ko": "이와테현", "kana": "いわてけん", "kind": _P},
    "宮城県": {"latin": "Miyagi", "zh": "宫城县", "zh-TW": "宮城縣", "ko": "미야기현", "kana": "みやぎけん", "kind": _P},
    "秋田県": {"latin": "Akita", "zh": "秋田县", "zh-TW": "秋田縣", "ko": "아키타현", "kana": "あきたけん", "kind": _P},
    "山形県": {"latin": "Yamagata", "zh": "山形县", "zh-TW": "山形縣", "ko": "야마가타현", "kana": "やまがたけん", "kind": _P},
    "福島県": {"latin": "Fukushima", "zh": "福岛县", "zh-TW": "福島縣", "ko": "후쿠시마현", "kana": "ふくしまけん", "kind": _P},
    "茨城県": {"latin": "Ibaraki", "zh": "茨城县", "zh-TW": "茨城縣", "ko": "이바라키현", "kana": "いばらきけん", "kind": _P},
    "栃木県": {"latin": "Tochigi", "zh": "栃木县", "zh-TW": "栃木縣", "ko": "도치기현", "kana": "とちぎけん", "kind": _P},
    "群馬県": {"latin": "Gunma", "zh": "群马县", "zh-TW": "群馬縣", "ko": "군마현", "kana": "ぐんまけん", "kind": _P},
    "埼玉県": {"latin": "Saitama", "zh": "埼玉县", "zh-TW": "埼玉縣", "ko": "사이타마현", "kana": "さいたまけん", "kind": _P},
    "千葉県": {"latin": "Chiba", "zh": "千叶县", "zh-TW": "千葉縣", "ko": "지바현", "kana": "ちばけん", "kind": _P},
    "東京都": {"latin": "Tokyo", "zh": "东京都", "zh-TW": "東京都", "ko": "도쿄도", "kana": "とうきょうと", "kind": _A,
        "overrides": {"de": "Tokio", "es": "Tokio"}},
    "神奈川県": {"latin": "Kanagawa", "zh": "神奈川县", "zh-TW": "神奈川縣", "ko": "가나가와현", "kana": "かながわけん", "kind": _P},
    "新潟県": {"latin": "Niigata", "zh": "新潟县", "zh-TW": "新潟縣", "ko": "니가타현", "kana": "にいがたけん", "kind": _P},
    "富山県": {"latin": "Toyama", "zh": "富山县", "zh-TW": "富山縣", "ko": "도야마현", "kana": "とやまけん", "kind": _P},
    "石川県": {"latin": "Ishikawa", "zh": "石川县", "zh-TW": "石川縣", "ko": "이시카와현", "kana": "いしかわけん", "kind": _P},
    "福井県": {"latin": "Fukui", "zh": "福井县", "zh-TW": "福井縣", "ko": "후쿠이현", "kana": "ふくいけん", "kind": _P},
    "山梨県": {"latin": "Yamanashi", "zh": "山梨县", "zh-TW": "山梨縣", "ko": "야마나시현", "kana": "やまなしけん", "kind": _P},
    "長野県": {"latin": "Nagano", "zh": "长野县", "zh-TW": "長野縣", "ko": "나가노현", "kana": "ながのけん", "kind": _P},
    "岐阜県": {"latin": "Gifu", "zh": "岐阜县", "zh-TW": "岐阜縣", "ko": "기후현", "kana": "ぎふけん", "kind": _P},
    "静岡県": {"latin": "Shizuoka", "zh": "静冈县", "zh-TW": "靜岡縣", "ko": "시즈오카현", "kana": "しずおかけん", "kind": _P},
    "愛知県": {"latin": "Aichi", "zh": "爱知县", "zh-TW": "愛知縣", "ko": "아이치현", "kana": "あいちけん", "kind": _P},
    "三重県": {"latin": "Mie", "zh": "三重县", "zh-TW": "三重縣", "ko": "미에현", "kana": "みえけん", "kind": _P},
    "滋賀県": {"latin": "Shiga", "zh": "滋贺县", "zh-TW": "滋賀縣", "ko": "시가현", "kana": "しがけん", "kind": _P},
    "京都府": {"latin": "Kyoto", "zh": "京都府", "zh-TW": "京都府", "ko": "교토부", "kana": "きょうとふ", "kind": _P},
    "大阪府": {"latin": "Osaka", "zh": "大阪府", "zh-TW": "大阪府", "ko": "오사카부", "kana": "おおさかふ", "kind": _P},
    "兵庫県": {"latin": "Hyogo", "zh": "兵库县", "zh-TW": "兵庫縣", "ko": "효고현", "kana": "ひょうごけん", "kind": _P},
    "奈良県": {"latin": "Nara", "zh": "奈良县", "zh-TW": "奈良縣", "ko": "나라현", "kana": "ならけん", "kind": _P},
    "和歌山県": {"latin": "Wakayama", "zh": "和歌山县", "zh-TW": "和歌山縣", "ko": "와카야마현", "kana": "わかやまけん", "kind": _P},
    "鳥取県": {"latin": "Tottori", "zh": "鸟取县", "zh-TW": "鳥取縣", "ko": "돗토리현", "kana": "とっとりけん", "kind": _P},
    "島根県": {"latin": "Shimane", "zh": "岛根县", "zh-TW": "島根縣", "ko": "시마네현", "kana": "しまねけん", "kind": _P},
    "岡山県": {"latin": "Okayama", "zh": "冈山县", "zh-TW": "岡山縣", "ko": "오카야마현", "kana": "おかやまけん", "kind": _P},
    "広島県": {"latin": "Hiroshima", "zh": "广岛县", "zh-TW": "廣島縣", "ko": "히로시마현", "kana": "ひろしまけん", "kind": _P},
    "山口県": {"latin": "Yamaguchi", "zh": "山口县", "zh-TW": "山口縣", "ko": "야마구치현", "kana": "やまぐちけん", "kind": _P},
    "徳島県": {"latin": "Tokushima", "zh": "德岛县", "zh-TW": "德島縣", "ko": "도쿠시마현", "kana": "とくしまけん", "kind": _P},
    "香川県": {"latin": "Kagawa", "zh": "香川县", "zh-TW": "香川縣", "ko": "가가와현", "kana": "かがわけん", "kind": _P},
    "愛媛県": {"latin": "Ehime", "zh": "爱媛县", "zh-TW": "愛媛縣", "ko": "에히메현", "kana": "えひめけん", "kind": _P},
    "高知県": {"latin": "Kochi", "zh": "高知县", "zh-TW": "高知縣", "ko": "고치현", "kana": "こうちけん", "kind": _P},
    "福岡県": {"latin": "Fukuoka", "zh": "福冈县", "zh-TW": "福岡縣", "ko": "후쿠오카현", "kana": "ふくおかけん", "kind": _P},
    "佐賀県": {"latin": "Saga", "zh": "佐贺县", "zh-TW": "佐賀縣", "ko": "사가현", "kana": "さがけん", "kind": _P},
    "長崎県": {"latin": "Nagasaki", "zh": "长崎县", "zh-TW": "長崎縣", "ko": "나가사키현", "kana": "ながさきけん", "kind": _P},
    "熊本県": {"latin": "Kumamoto", "zh": "熊本县", "zh-TW": "熊本縣", "ko": "구마모토현", "kana": "くまもとけん", "kind": _P},
    "大分県": {"latin": "Oita", "zh": "大分县", "zh-TW": "大分縣", "ko": "오이타현", "kana": "おおいたけん", "kind": _P},
    "宮崎県": {"latin": "Miyazaki", "zh": "宫崎县", "zh-TW": "宮崎縣", "ko": "미야자키현", "kana": "みやざきけん", "kind": _P},
    "鹿児島県": {"latin": "Kagoshima", "zh": "鹿儿岛县", "zh-TW": "鹿兒島縣", "ko": "가고시마현", "kana": "かごしまけん", "kind": _P},
    "沖縄県": {"latin": "Okinawa", "zh": "冲绳县", "zh-TW": "沖繩縣", "ko": "오키나와현", "kana": "おきなわけん", "kind": _P},

    # ---- 地方・地域（都道府県の下位、または複数県にまたがる呼称） ----
    "石狩": {"latin": "Ishikari", "zh": "石狩", "zh-TW": "石狩", "ko": "이시카리", "kana": "いしかり", "kind": _A},
    "胆振": {"latin": "Iburi", "zh": "胆振", "zh-TW": "膽振", "ko": "이부리", "kana": "いぶり", "kind": _A},
    "日高": {"latin": "Hidaka", "zh": "日高", "zh-TW": "日高", "ko": "히다카", "kana": "ひだか", "kind": _A},
    "網走": {"latin": "Abashiri", "zh": "网走", "zh-TW": "網走", "ko": "아바시리", "kana": "あばしり", "kind": _A},
    "上川": {"latin": "Kamikawa", "zh": "上川", "zh-TW": "上川", "ko": "가미카와", "kana": "かみかわ", "kind": _A},
    "留萌": {"latin": "Rumoi", "zh": "留萌", "zh-TW": "留萌", "ko": "루모이", "kana": "るもい", "kind": _A},
    "宗谷": {"latin": "Soya", "zh": "宗谷", "zh-TW": "宗谷", "ko": "소야", "kana": "そうや", "kind": _A},
    "檜山": {"latin": "Hiyama", "zh": "桧山", "zh-TW": "檜山", "ko": "히야마", "kana": "ひやま", "kind": _A},
    "渡島": {"latin": "Oshima", "zh": "渡岛", "zh-TW": "渡島", "ko": "오시마", "kana": "おしま", "kind": _A},
    "後志": {"latin": "Shiribeshi", "zh": "后志", "zh-TW": "後志", "ko": "시리베시", "kana": "しりべし", "kind": _A},
    "空知": {"latin": "Sorachi", "zh": "空知", "zh-TW": "空知", "ko": "소라치", "kana": "そらち", "kind": _A},
    "庄内": {"latin": "Shonai", "zh": "庄内", "zh-TW": "庄內", "ko": "쇼나이", "kana": "しょうない", "kind": _A},
    "村山": {"latin": "Murayama", "zh": "村山", "zh-TW": "村山", "ko": "무라야마", "kana": "むらやま", "kind": _A},
    "置賜": {"latin": "Okitama", "zh": "置赐", "zh-TW": "置賜", "ko": "오키타마", "kana": "おきたま", "kind": _A},
    "最上": {"latin": "Mogami", "zh": "最上", "zh-TW": "最上", "ko": "모가미", "kana": "もがみ", "kind": _A},
    "会津": {"latin": "Aizu", "zh": "会津", "zh-TW": "會津", "ko": "아이즈", "kana": "あいづ", "kind": _A},
    "中通り": {"latin": "Nakadori", "zh": "中通", "zh-TW": "中通", "ko": "나카도리", "kana": "なかどおり", "kind": _A},
    "浜通り": {"latin": "Hamadori", "zh": "滨通", "zh-TW": "濱通", "ko": "하마도리", "kana": "はまどおり", "kind": _A},
    "上越": {"latin": "Joetsu", "zh": "上越", "zh-TW": "上越", "ko": "조에쓰", "kana": "じょうえつ", "kind": _A},
    "中越": {"latin": "Chuetsu", "zh": "中越", "zh-TW": "中越", "ko": "주에쓰", "kana": "ちゅうえつ", "kind": _A},
    "下越": {"latin": "Kaetsu", "zh": "下越", "zh-TW": "下越", "ko": "가에쓰", "kana": "かえつ", "kind": _A},
    "能登": {"latin": "Noto", "zh": "能登", "zh-TW": "能登", "ko": "노토", "kana": "のと", "kind": _A},
    "加賀": {"latin": "Kaga", "zh": "加贺", "zh-TW": "加賀", "ko": "가가", "kana": "かが", "kind": _A},
    "嶺北": {"latin": "Reihoku", "zh": "岭北", "zh-TW": "嶺北", "ko": "레이호쿠", "kana": "れいほく", "kind": _A},
    "嶺南": {"latin": "Reinan", "zh": "岭南", "zh-TW": "嶺南", "ko": "레이난", "kana": "れいなん", "kind": _A},
    "飛騨": {"latin": "Hida", "zh": "飞驒", "zh-TW": "飛驒", "ko": "히다", "kana": "ひだ", "kind": _A},
    "美濃": {"latin": "Mino", "zh": "美浓", "zh-TW": "美濃", "ko": "미노", "kana": "みの", "kind": _A},
    "伊豆": {"latin": "Izu", "zh": "伊豆", "zh-TW": "伊豆", "ko": "이즈", "kana": "いず", "kind": _A},
    "多摩": {"latin": "Tama", "zh": "多摩", "zh-TW": "多摩", "ko": "다마", "kana": "たま", "kind": _A},
    "阿蘇": {"latin": "Aso", "zh": "阿苏", "zh-TW": "阿蘇", "ko": "아소", "kana": "あそ", "kind": _A},
    "天草・芦北": {"latin": "Amakusa-Ashikita", "zh": "天草・芦北", "zh-TW": "天草・蘆北", "ko": "아마쿠사·아시키타", "kana": "あまくさ・あしきた", "kind": _A},
    "天草": {"latin": "Amakusa", "zh": "天草", "zh-TW": "天草", "ko": "아마쿠사", "kana": "あまくさ", "kind": _A},
    "薩摩": {"latin": "Satsuma", "zh": "萨摩", "zh-TW": "薩摩", "ko": "사쓰마", "kana": "さつま", "kind": _A},
    "大隅": {"latin": "Osumi", "zh": "大隅", "zh-TW": "大隅", "ko": "오스미", "kana": "おおすみ", "kind": _A},
    "安芸": {"latin": "Aki", "zh": "安艺", "zh-TW": "安藝", "ko": "아키", "kana": "あき", "kind": _A},
    "豊後": {"latin": "Bungo", "zh": "丰后", "zh-TW": "豐後", "ko": "분고", "kana": "ぶんご", "kind": _A},
    "紀伊": {"latin": "Kii", "zh": "纪伊", "zh-TW": "紀伊", "ko": "기이", "kana": "きい", "kind": _A},
    "三陸": {"latin": "Sanriku", "zh": "三陆", "zh-TW": "三陸", "ko": "산리쿠", "kana": "さんりく", "kind": _A},
    "日向": {"latin": "Hyuga", "zh": "日向", "zh-TW": "日向", "ko": "휴가", "kana": "ひゅうが", "kind": _A},

    # ---- 島・半島・海域 ----
    # 「島」「半島」「列島」は PLACE_TYPES で分解する。ここに焼き込むと
    # "Noto Peninsula" のような英語が仏独伊西の文の中に残る（既存訳は
    # "péninsule de Noto" と地形語を訳し分けている）
    "八丈": {"latin": "Hachijo", "zh": "八丈", "zh-TW": "八丈", "ko": "하치조", "kana": "はちじょう", "kind": _A},
    "三宅": {"latin": "Miyake", "zh": "三宅", "zh-TW": "三宅", "ko": "미야케", "kana": "みやけ", "kind": _A},
    "宮古": {"latin": "Miyako", "zh": "宫古", "zh-TW": "宮古", "ko": "미야코", "kana": "みやこ", "kind": _A},
    "石垣": {"latin": "Ishigaki", "zh": "石垣", "zh-TW": "石垣", "ko": "이시가키", "kana": "いしがき", "kind": _A},
    "与那国": {"latin": "Yonaguni", "zh": "与那国", "zh-TW": "與那國", "ko": "요나구니", "kana": "よなぐに", "kind": _A},
    "トカラ": {"latin": "Tokara", "zh": "吐噶喇", "zh-TW": "吐噶喇", "ko": "도카라", "kana": "とから", "kind": _A},
    "小笠原": {"latin": "Ogasawara", "zh": "小笠原", "zh-TW": "小笠原", "ko": "오가사와라", "kana": "おがさわら", "kind": _A},
    "房総": {"latin": "Boso", "zh": "房总", "zh-TW": "房總", "ko": "보소", "kana": "ぼうそう", "kind": _A},
    # 慣用の英名が融合している島は分解しない（"Iwo Island" のような非標準形を避ける）
    "伊豆大島": {"latin": "Izu-Oshima", "zh": "伊豆大岛", "zh-TW": "伊豆大島", "ko": "이즈오시마", "kana": "いずおおしま", "kind": _A},
    "奄美大島": {"latin": "Amami-Oshima", "zh": "奄美大岛", "zh-TW": "奄美大島", "ko": "아마미오시마", "kana": "あまみおおしま", "kind": _A},
    "硫黄島": {"latin": "Iwoto", "zh": "硫黄岛", "zh-TW": "硫磺島", "ko": "이오토", "kana": "いおうとう", "kind": _A},
    "父島": {"latin": "Chichijima", "zh": "父岛", "zh-TW": "父島", "ko": "지치지마", "kana": "ちちじま", "kind": _A},
    # 国際的に定着した海の名前も融合形のまま持つ（"Okhotsk Sea" ではなく "Sea of Okhotsk"）
    "オホーツク海": {"latin": "Sea of Okhotsk", "zh": "鄂霍次克海", "zh-TW": "鄂霍次克海", "ko": "오호츠크해", "kana": "おほーつくかい", "kind": _A,
        "overrides": {"vi": "biển Okhotsk", "id": "Laut Okhotsk", "ms": "Laut Okhotsk", "tl": "Dagat Okhotsk", "fr": "la mer d'Okhotsk", "de": "Ochotskisches Meer", "it": "il mare di Ochotsk", "es": "el mar de Ojotsk"}},
    "日本海": {"latin": "Sea of Japan", "zh": "日本海", "zh-TW": "日本海", "ko": "동해", "kana": "にほんかい", "kind": _A,
        "overrides": {"vi": "biển Nhật Bản", "id": "Laut Jepang", "ms": "Laut Jepun", "tl": "Dagat Hapon", "fr": "la mer du Japon", "de": "Japanisches Meer", "it": "il mar del Giappone", "es": "el mar del Japón"}},
    "東シナ海": {"latin": "East China Sea", "zh": "东海", "zh-TW": "東海", "ko": "동중국해", "kana": "ひがししなかい", "kind": _A,
        "overrides": {"vi": "biển Hoa Đông", "id": "Laut Cina Timur", "ms": "Laut China Timur", "tl": "Dagat Timog-Silangang Tsina", "fr": "la mer de Chine orientale", "de": "Ostchinesisches Meer", "it": "il mar Cinese Orientale", "es": "el mar de China Oriental"}},
    "浦河": {"latin": "Urakawa", "zh": "浦河", "zh-TW": "浦河", "ko": "우라카와", "kana": "うらかわ", "kind": _A},
    "十勝": {"latin": "Tokachi", "zh": "十胜", "zh-TW": "十勝", "ko": "도카치", "kana": "とかち", "kind": _A},
    "釧路": {"latin": "Kushiro", "zh": "钏路", "zh-TW": "釧路", "ko": "구시로", "kana": "くしろ", "kind": _A},
    "根室": {"latin": "Nemuro", "zh": "根室", "zh-TW": "根室", "ko": "네무로", "kana": "ねむろ", "kind": _A},
    "四国": {"latin": "Shikoku", "zh": "四国", "zh-TW": "四國", "ko": "시코쿠", "kana": "しこく", "kind": _A},
    "九州": {"latin": "Kyushu", "zh": "九州", "zh-TW": "九州", "ko": "규슈", "kana": "きゅうしゅう", "kind": _A},
    "東京": {"latin": "Tokyo", "zh": "东京", "zh-TW": "東京", "ko": "도쿄", "kana": "とうきょう", "kind": _A,
        "overrides": {"de": "Tokio", "es": "Tokio"}},
    "大阪": {"latin": "Osaka", "zh": "大阪", "zh-TW": "大阪", "ko": "오사카", "kana": "おおさか", "kind": _A},
    "相模": {"latin": "Sagami", "zh": "相模", "zh-TW": "相模", "ko": "사가미", "kana": "さがみ", "kind": _A},
    "駿河": {"latin": "Suruga", "zh": "骏河", "zh-TW": "駿河", "ko": "스루가", "kana": "するが", "kind": _A},
    "伊勢": {"latin": "Ise", "zh": "伊势", "zh-TW": "伊勢", "ko": "이세", "kana": "いせ", "kind": _A},
    "若狭": {"latin": "Wakasa", "zh": "若狭", "zh-TW": "若狹", "ko": "와카사", "kana": "わかさ", "kind": _A},
    "陸奥": {"latin": "Mutsu", "zh": "陆奥", "zh-TW": "陸奧", "ko": "무쓰", "kana": "むつ", "kind": _A},
    # ---- 国外（気象庁は日本に影響しうる遠地地震も配信する。全レポートの 0.6%）----
    # カタカナのままだと非日本語話者には読めないため、主要な震源国だけ収録する。
    "インドネシア": {"latin": "Indonesia", "zh": "印度尼西亚", "zh-TW": "印尼", "ko": "인도네시아", "kana": "いんどねしあ", "kind": _A},
    "フィリピン": {"latin": "Philippines", "zh": "菲律宾", "zh-TW": "菲律賓", "ko": "필리핀", "kana": "ふぃりぴん", "kind": _A},
    "パプアニューギニア": {"latin": "Papua New Guinea", "zh": "巴布亚新几内亚", "zh-TW": "巴布亞紐幾內亞", "ko": "파푸아뉴기니", "kana": "ぱぷあにゅーぎにあ", "kind": _A},
    "バヌアツ": {"latin": "Vanuatu", "zh": "瓦努阿图", "zh-TW": "萬那杜", "ko": "바누아투", "kana": "ばぬあつ", "kind": _A},
    "トンガ": {"latin": "Tonga", "zh": "汤加", "zh-TW": "東加", "ko": "통가", "kana": "とんが", "kind": _A},
    "ソロモン諸島": {"latin": "Solomon Islands", "zh": "所罗门群岛", "zh-TW": "索羅門群島", "ko": "솔로몬 제도", "kana": "そろもんしょとう", "kind": _A},
    "ニュージーランド": {"latin": "New Zealand", "zh": "新西兰", "zh-TW": "紐西蘭", "ko": "뉴질랜드", "kana": "にゅーじーらんど", "kind": _A},
    "チリ": {"latin": "Chile", "zh": "智利", "zh-TW": "智利", "ko": "칠레", "kana": "ちり", "kind": _A},
    "ペルー": {"latin": "Peru", "zh": "秘鲁", "zh-TW": "秘魯", "ko": "페루", "kana": "ぺるー", "kind": _A},
    "エクアドル": {"latin": "Ecuador", "zh": "厄瓜多尔", "zh-TW": "厄瓜多", "ko": "에콰도르", "kana": "えくあどる", "kind": _A},
    "コロンビア": {"latin": "Colombia", "zh": "哥伦比亚", "zh-TW": "哥倫比亞", "ko": "콜롬비아", "kana": "ころんびあ", "kind": _A},
    "メキシコ": {"latin": "Mexico", "zh": "墨西哥", "zh-TW": "墨西哥", "ko": "멕시코", "kana": "めきしこ", "kind": _A},
    "アラスカ": {"latin": "Alaska", "zh": "阿拉斯加", "zh-TW": "阿拉斯加", "ko": "알래스카", "kana": "あらすか", "kind": _A},
    "カムチャツカ": {"latin": "Kamchatka", "zh": "堪察加", "zh-TW": "堪察加", "ko": "캄차카", "kana": "かむちゃつか", "kind": _A},
    "千島列島": {"latin": "Kuril Islands", "zh": "千岛群岛", "zh-TW": "千島群島", "ko": "쿠릴 열도", "kana": "ちしまれっとう", "kind": _A},
    "サハリン": {"latin": "Sakhalin", "zh": "萨哈林", "zh-TW": "薩哈林", "ko": "사할린", "kana": "さはりん", "kind": _A},
    "トルコ": {"latin": "Turkey", "zh": "土耳其", "zh-TW": "土耳其", "ko": "튀르키예", "kana": "とるこ", "kind": _A},
    "ギリシャ": {"latin": "Greece", "zh": "希腊", "zh-TW": "希臘", "ko": "그리스", "kana": "ぎりしゃ", "kind": _A},
    "イラン": {"latin": "Iran", "zh": "伊朗", "zh-TW": "伊朗", "ko": "이란", "kana": "いらん", "kind": _A},
    "アフガニスタン": {"latin": "Afghanistan", "zh": "阿富汗", "zh-TW": "阿富汗", "ko": "아프가니스탄", "kana": "あふがにすたん", "kind": _A},
    "ネパール": {"latin": "Nepal", "zh": "尼泊尔", "zh-TW": "尼泊爾", "ko": "네팔", "kana": "ねぱーる", "kind": _A},
    "ミャンマー": {"latin": "Myanmar", "zh": "缅甸", "zh-TW": "緬甸", "ko": "미얀마", "kana": "みゃんまー", "kind": _A},
    "中国": {"latin": "China", "zh": "中国", "zh-TW": "中國", "ko": "중국", "kana": "ちゅうごく", "kind": _A},
    "フローレス": {"latin": "Flores", "zh": "弗洛勒斯", "zh-TW": "弗洛勒斯", "ko": "플로레스", "kana": "ふろーれす", "kind": _A},
    "スマトラ": {"latin": "Sumatra", "zh": "苏门答腊", "zh-TW": "蘇門答臘", "ko": "수마트라", "kana": "すまとら", "kind": _A},
    "ジャワ": {"latin": "Java", "zh": "爪哇", "zh-TW": "爪哇", "ko": "자바", "kana": "じゃわ", "kind": _A},
    "ミンダナオ": {"latin": "Mindanao", "zh": "棉兰老", "zh-TW": "民答那峨", "ko": "민다나오", "kana": "みんだなお", "kind": _A},
    "台湾": {"latin": "Taiwan", "zh": "台湾", "zh-TW": "台灣", "ko": "대만", "kana": "たいわん", "kind": _A},
    "沖縄": {"latin": "Okinawa", "zh": "冲绳", "zh-TW": "沖繩", "ko": "오키나와", "kana": "おきなわ", "kind": _A},
}

#: ラテン系言語で「県」に当たる語をどう付けるか。`{n}` が地名、`{de}` は
#: フランス語のエリジオン（母音の前で de → d'）を適用した形。
LATIN_PREFECTURE_MARKER: dict[str, str] = {
    "en": "{n} Prefecture",
    "vi": "tỉnh {n}",
    "th": "จังหวัด {n}",
    "id": "Prefektur {n}",
    "ms": "Wilayah {n}",
    "tl": "{n}",
    "fr": "la préfecture {de}",
    "de": "Präfektur {n}",
    "it": "{n}",
    "es": "la prefectura de {n}",
    "ne": "{n} प्रान्त",
}

#: 方角・位置を表す修飾語。`{place}` に組み立て済みの地名が入る。
MODIFIERS: dict[str, dict[str, str]] = {
    "北部": {
        "en": "Northern {place}", "zh": "{place}北部", "zh-TW": "{place}北部", "ko": "{place} 북부",
        "vi": "Phía bắc {place}", "th": "ภาคเหนือของ {place}", "id": "{place} bagian utara",
        "ms": "Utara {place}", "tl": "Hilagang {place}", "fr": "Nord de {place}",
        "de": "Nördliche {place}", "it": "{place} settentrionale", "es": "Norte de {place}",
        "ne": "{place}को उत्तरी भाग", "easy_ja": "{place} の きた",
    },
    "南部": {
        "en": "Southern {place}", "zh": "{place}南部", "zh-TW": "{place}南部", "ko": "{place} 남부",
        "vi": "Phía nam {place}", "th": "ภาคใต้ของ {place}", "id": "{place} bagian selatan",
        "ms": "Selatan {place}", "tl": "Timog na {place}", "fr": "Sud de {place}",
        "de": "Südliche {place}", "it": "{place} meridionale", "es": "Sur de {place}",
        "ne": "{place}को दक्षिणी भाग", "easy_ja": "{place} の みなみ",
    },
    "東部": {
        "en": "Eastern {place}", "zh": "{place}东部", "zh-TW": "{place}東部", "ko": "{place} 동부",
        "vi": "Phía đông {place}", "th": "ภาคตะวันออกของ {place}", "id": "{place} bagian timur",
        "ms": "Timur {place}", "tl": "Silangang {place}", "fr": "Est de {place}",
        "de": "Östliche {place}", "it": "{place} orientale", "es": "Este de {place}",
        "ne": "{place}को पूर्वी भाग", "easy_ja": "{place} の ひがし",
    },
    "西部": {
        "en": "Western {place}", "zh": "{place}西部", "zh-TW": "{place}西部", "ko": "{place} 서부",
        "vi": "Phía tây {place}", "th": "ภาคตะวันตกของ {place}", "id": "{place} bagian barat",
        "ms": "Barat {place}", "tl": "Kanlurang {place}", "fr": "Ouest de {place}",
        "de": "Westliche {place}", "it": "{place} occidentale", "es": "Oeste de {place}",
        "ne": "{place}को पश्चिमी भाग", "easy_ja": "{place} の にし",
    },
    "中部": {
        "en": "Central {place}", "zh": "{place}中部", "zh-TW": "{place}中部", "ko": "{place} 중부",
        "vi": "Miền trung {place}", "th": "ภาคกลางของ {place}", "id": "{place} bagian tengah",
        "ms": "Tengah {place}", "tl": "Gitnang {place}", "fr": "Centre de {place}",
        "de": "Zentrale {place}", "it": "{place} centrale", "es": "Centro de {place}",
        "ne": "{place}को मध्य भाग", "easy_ja": "{place} の まんなか",
    },
    "北東部": {
        "en": "Northeastern {place}", "zh": "{place}东北部", "zh-TW": "{place}東北部", "ko": "{place} 북동부",
        "vi": "Phía đông bắc {place}", "th": "ภาคตะวันออกเฉียงเหนือของ {place}", "id": "{place} bagian timur laut",
        "ms": "Timur laut {place}", "tl": "Hilagang-silangang {place}", "fr": "Nord-est de {place}",
        "de": "Nordöstliche {place}", "it": "{place} nord-orientale", "es": "Noreste de {place}",
        "ne": "{place}को उत्तरपूर्वी भाग", "easy_ja": "{place} の きたひがし",
    },
    "北西部": {
        "en": "Northwestern {place}", "zh": "{place}西北部", "zh-TW": "{place}西北部", "ko": "{place} 북서부",
        "vi": "Phía tây bắc {place}", "th": "ภาคตะวันตกเฉียงเหนือของ {place}", "id": "{place} bagian barat laut",
        "ms": "Barat laut {place}", "tl": "Hilagang-kanlurang {place}", "fr": "Nord-ouest de {place}",
        "de": "Nordwestliche {place}", "it": "{place} nord-occidentale", "es": "Noroeste de {place}",
        "ne": "{place}को उत्तरपश्चिमी भाग", "easy_ja": "{place} の きたにし",
    },
    "南東部": {
        "en": "Southeastern {place}", "zh": "{place}东南部", "zh-TW": "{place}東南部", "ko": "{place} 남동부",
        "vi": "Phía đông nam {place}", "th": "ภาคตะวันออกเฉียงใต้ของ {place}", "id": "{place} bagian tenggara",
        "ms": "Tenggara {place}", "tl": "Timog-silangang {place}", "fr": "Sud-est de {place}",
        "de": "Südöstliche {place}", "it": "{place} sud-orientale", "es": "Sureste de {place}",
        "ne": "{place}को दक्षिणपूर्वी भाग", "easy_ja": "{place} の みなみひがし",
    },
    "南西部": {
        "en": "Southwestern {place}", "zh": "{place}西南部", "zh-TW": "{place}西南部", "ko": "{place} 남서부",
        "vi": "Phía tây nam {place}", "th": "ภาคตะวันตกเฉียงใต้ของ {place}", "id": "{place} bagian barat daya",
        "ms": "Barat daya {place}", "tl": "Timog-kanlurang {place}", "fr": "Sud-ouest de {place}",
        "de": "Südwestliche {place}", "it": "{place} sud-occidentale", "es": "Suroeste de {place}",
        "ne": "{place}को दक्षिणपश्चिमी भाग", "easy_ja": "{place} の みなみにし",
    },
    "中南部": {
        "en": "South-central {place}", "zh": "{place}中南部", "zh-TW": "{place}中南部", "ko": "{place} 중남부",
        "vi": "Trung nam {place}", "th": "ภาคกลางตอนใต้ของ {place}", "id": "{place} bagian tengah-selatan",
        "ms": "Tengah-selatan {place}", "tl": "Gitnang-timog na {place}", "fr": "Centre-sud de {place}",
        "de": "Süd-zentrale {place}", "it": "{place} centro-meridionale", "es": "Centro-sur de {place}",
        "ne": "{place}को मध्य-दक्षिणी भाग", "easy_ja": "{place} の まんなかみなみ",
    },
    "中東部": {
        "en": "East-central {place}", "zh": "{place}中东部", "zh-TW": "{place}中東部", "ko": "{place} 중동부",
        "vi": "Trung đông {place}", "th": "ภาคกลางตอนตะวันออกของ {place}", "id": "{place} bagian tengah-timur",
        "ms": "Tengah-timur {place}", "tl": "Gitnang-silangang {place}", "fr": "Centre-est de {place}",
        "de": "Ost-zentrale {place}", "it": "{place} centro-orientale", "es": "Centro-este de {place}",
        "ne": "{place}को मध्य-पूर्वी भाग", "easy_ja": "{place} の まんなかひがし",
    },
    "中西部": {
        "en": "West-central {place}", "zh": "{place}中西部", "zh-TW": "{place}中西部", "ko": "{place} 중서부",
        "vi": "Trung tây {place}", "th": "ภาคกลางตอนตะวันตกของ {place}", "id": "{place} bagian tengah-barat",
        "ms": "Tengah-barat {place}", "tl": "Gitnang-kanlurang {place}", "fr": "Centre-ouest de {place}",
        "de": "West-zentrale {place}", "it": "{place} centro-occidentale", "es": "Centro-oeste de {place}",
        "ne": "{place}को मध्य-पश्चिमी भाग", "easy_ja": "{place} の まんなかにし",
    },
    "沿岸北部": {
        "en": "Northern coast of {place}", "zh": "{place}沿岸北部", "zh-TW": "{place}沿岸北部", "ko": "{place} 연안 북부",
        "vi": "Bờ biển phía bắc {place}", "th": "ชายฝั่งเหนือของ {place}", "id": "Pesisir utara {place}",
        "ms": "Pantai utara {place}", "tl": "Hilagang baybayin ng {place}", "fr": "Côte nord de {place}",
        "de": "Nordküste der {place}", "it": "Costa settentrionale di {place}", "es": "Costa norte de {place}",
        "ne": "{place}को उत्तरी तट", "easy_ja": "{place} の きたの うみべ",
    },
    "沿岸南部": {
        "en": "Southern coast of {place}", "zh": "{place}沿岸南部", "zh-TW": "{place}沿岸南部", "ko": "{place} 연안 남부",
        "vi": "Bờ biển phía nam {place}", "th": "ชายฝั่งใต้ของ {place}", "id": "Pesisir selatan {place}",
        "ms": "Pantai selatan {place}", "tl": "Timog baybayin ng {place}", "fr": "Côte sud de {place}",
        "de": "Südküste der {place}", "it": "Costa meridionale di {place}", "es": "Costa sur de {place}",
        "ne": "{place}को दक्षिणी तट", "easy_ja": "{place} の みなみの うみべ",
    },
    "内陸北部": {
        "en": "Northern inland {place}", "zh": "{place}内陆北部", "zh-TW": "{place}內陸北部", "ko": "{place} 내륙 북부",
        "vi": "Nội địa phía bắc {place}", "th": "พื้นที่ตอนในทางเหนือของ {place}", "id": "Pedalaman utara {place}",
        "ms": "Pedalaman utara {place}", "tl": "Hilagang looban ng {place}", "fr": "Intérieur nord de {place}",
        "de": "Nördliches Binnenland der {place}", "it": "Entroterra settentrionale di {place}",
        "es": "Interior norte de {place}", "ne": "{place}को उत्तरी भित्री भाग",
        "easy_ja": "{place} の きたの うちがわ",
    },
    "内陸南部": {
        "en": "Southern inland {place}", "zh": "{place}内陆南部", "zh-TW": "{place}內陸南部", "ko": "{place} 내륙 남부",
        "vi": "Nội địa phía nam {place}", "th": "พื้นที่ตอนในทางใต้ของ {place}", "id": "Pedalaman selatan {place}",
        "ms": "Pedalaman selatan {place}", "tl": "Timog looban ng {place}", "fr": "Intérieur sud de {place}",
        "de": "Südliches Binnenland der {place}", "it": "Entroterra meridionale di {place}",
        "es": "Interior sur de {place}", "ne": "{place}को दक्षिणी भित्री भाग",
        "easy_ja": "{place} の みなみの うちがわ",
    },
    "沿岸": {
        "en": "Coast of {place}", "zh": "{place}沿岸", "zh-TW": "{place}沿岸", "ko": "{place} 연안",
        "vi": "Bờ biển {place}", "th": "ชายฝั่ง {place}", "id": "Pesisir {place}",
        "ms": "Pantai {place}", "tl": "Baybayin ng {place}", "fr": "Côte de {place}",
        "de": "Küste der {place}", "it": "Costa di {place}", "es": "Costa de {place}",
        "ne": "{place}को तट", "easy_ja": "{place} の うみべ",
    },
    "内陸": {
        "en": "Inland {place}", "zh": "{place}内陆", "zh-TW": "{place}內陸", "ko": "{place} 내륙",
        "vi": "Nội địa {place}", "th": "พื้นที่ตอนในของ {place}", "id": "Pedalaman {place}",
        "ms": "Pedalaman {place}", "tl": "Looban ng {place}", "fr": "Intérieur de {place}",
        "de": "Binnenland der {place}", "it": "Entroterra di {place}", "es": "Interior de {place}",
        "ne": "{place}को भित्री भाग", "easy_ja": "{place} の うちがわ",
    },
}

#: その場所との位置関係を表す語。組み立て済みの場所表現に付く。
RELATIONS: dict[str, dict[str, str]] = {
    "沖": {
        "en": "Off the coast of {place}", "zh": "{place}近海", "zh-TW": "{place}近海", "ko": "{place} 앞바다",
        "vi": "Ngoài khơi {place}", "th": "นอกชายฝั่ง {place}", "id": "Lepas pantai {place}",
        "ms": "Luar pantai {place}", "tl": "Sa baybayin ng {place}", "fr": "Au large de {place}",
        "de": "Vor der Küste der {place}", "it": "Al largo di {place}", "es": "Frente a la costa de {place}",
        "ne": "{place}को तटमा", "easy_ja": "{place} の うみ",
    },
    "近海": {
        "en": "Near {place}", "zh": "{place}近海", "zh-TW": "{place}近海", "ko": "{place} 근해",
        "vi": "Gần {place}", "th": "ใกล้ {place}", "id": "Dekat {place}",
        "ms": "Berhampiran {place}", "tl": "Malapit sa {place}", "fr": "Près de {place}",
        "de": "Nahe der {place}", "it": "Vicino a {place}", "es": "Cerca de {place}",
        "ne": "{place} नजिकको समुद्र", "easy_ja": "{place} の ちかくの うみ",
    },
    "付近": {
        "en": "Near {place}", "zh": "{place}附近", "zh-TW": "{place}附近", "ko": "{place} 부근",
        "vi": "Gần {place}", "th": "ใกล้ {place}", "id": "Dekat {place}",
        "ms": "Berhampiran {place}", "tl": "Malapit sa {place}", "fr": "Près de {place}",
        "de": "Nahe der {place}", "it": "Vicino a {place}", "es": "Cerca de {place}",
        "ne": "{place} नजिक", "easy_ja": "{place} の ちかく",
    },
    "東方沖": {
        "en": "Off the east coast of {place}", "zh": "{place}以东海域", "zh-TW": "{place}以東海域", "ko": "{place} 동쪽 앞바다",
        "vi": "Ngoài khơi phía đông {place}", "th": "นอกชายฝั่งตะวันออกของ {place}", "id": "Lepas pantai timur {place}",
        "ms": "Luar pantai timur {place}", "tl": "Silangang baybayin ng {place}", "fr": "Au large, à l'est de {place}",
        "de": "Östlich vor der Küste der {place}", "it": "Al largo a est di {place}",
        "es": "Frente a la costa este de {place}", "ne": "{place}को पूर्वी तटमा",
        "easy_ja": "{place} の ひがしの うみ",
    },
    "西方沖": {
        "en": "Off the west coast of {place}", "zh": "{place}以西海域", "zh-TW": "{place}以西海域", "ko": "{place} 서쪽 앞바다",
        "vi": "Ngoài khơi phía tây {place}", "th": "นอกชายฝั่งตะวันตกของ {place}", "id": "Lepas pantai barat {place}",
        "ms": "Luar pantai barat {place}", "tl": "Kanlurang baybayin ng {place}", "fr": "Au large, à l'ouest de {place}",
        "de": "Westlich vor der Küste der {place}", "it": "Al largo a ovest di {place}",
        "es": "Frente a la costa oeste de {place}", "ne": "{place}को पश्चिमी तटमा",
        "easy_ja": "{place} の にしの うみ",
    },
    "南方沖": {
        "en": "Off the south coast of {place}", "zh": "{place}以南海域", "zh-TW": "{place}以南海域", "ko": "{place} 남쪽 앞바다",
        "vi": "Ngoài khơi phía nam {place}", "th": "นอกชายฝั่งใต้ของ {place}", "id": "Lepas pantai selatan {place}",
        "ms": "Luar pantai selatan {place}", "tl": "Timog baybayin ng {place}", "fr": "Au large au sud de {place}",
        "de": "Südlich vor der Küste der {place}", "it": "Al largo a sud di {place}",
        "es": "Frente a la costa sur de {place}", "ne": "{place}को दक्षिणी तटमा",
        "easy_ja": "{place} の みなみの うみ",
    },
    "北方沖": {
        "en": "Off the north coast of {place}", "zh": "{place}以北海域", "zh-TW": "{place}以北海域", "ko": "{place} 북쪽 앞바다",
        "vi": "Ngoài khơi phía bắc {place}", "th": "นอกชายฝั่งเหนือของ {place}", "id": "Lepas pantai utara {place}",
        "ms": "Luar pantai utara {place}", "tl": "Hilagang baybayin ng {place}", "fr": "Au large au nord de {place}",
        "de": "Nördlich vor der Küste der {place}", "it": "Al largo a nord di {place}",
        "es": "Frente a la costa norte de {place}", "ne": "{place}को उत्तरी तटमा",
        "easy_ja": "{place} の きたの うみ",
    },
    "北東沖": {
        "en": "Off the northeast coast of {place}", "zh": "{place}东北海域", "zh-TW": "{place}東北海域", "ko": "{place} 북동쪽 앞바다",
        "vi": "Ngoài khơi đông bắc {place}", "th": "นอกชายฝั่งตะวันออกเฉียงเหนือของ {place}", "id": "Lepas pantai timur laut {place}",
        "ms": "Luar pantai timur laut {place}", "tl": "Hilagang-silangang baybayin ng {place}",
        "fr": "Au large au nord-est de {place}", "de": "Nordöstlich vor der Küste der {place}",
        "it": "Al largo a nord-est di {place}", "es": "Frente a la costa noreste de {place}",
        "ne": "{place}को उत्तरपूर्वी तटमा", "easy_ja": "{place} の きたひがしの うみ",
    },
    "北西沖": {
        "en": "Off the northwest coast of {place}", "zh": "{place}西北海域", "zh-TW": "{place}西北海域", "ko": "{place} 북서쪽 앞바다",
        "vi": "Ngoài khơi tây bắc {place}", "th": "นอกชายฝั่งตะวันตกเฉียงเหนือของ {place}", "id": "Lepas pantai barat laut {place}",
        "ms": "Luar pantai barat laut {place}", "tl": "Hilagang-kanlurang baybayin ng {place}",
        "fr": "Au large au nord-ouest de {place}", "de": "Nordwestlich vor der Küste der {place}",
        "it": "Al largo a nord-ovest di {place}", "es": "Frente a la costa noroeste de {place}",
        "ne": "{place}को उत्तरपश्चिमी तटमा", "easy_ja": "{place} の きたにしの うみ",
    },
    "南東沖": {
        "en": "Off the southeast coast of {place}", "zh": "{place}东南海域", "zh-TW": "{place}東南海域", "ko": "{place} 남동쪽 앞바다",
        "vi": "Ngoài khơi đông nam {place}", "th": "นอกชายฝั่งตะวันออกเฉียงใต้ของ {place}", "id": "Lepas pantai tenggara {place}",
        "ms": "Luar pantai tenggara {place}", "tl": "Timog-silangang baybayin ng {place}",
        "fr": "Au large au sud-est de {place}", "de": "Südöstlich vor der Küste der {place}",
        "it": "Al largo a sud-est di {place}", "es": "Frente a la costa sureste de {place}",
        "ne": "{place}को दक्षिणपूर्वी तटमा", "easy_ja": "{place} の みなみひがしの うみ",
    },
    "南西沖": {
        "en": "Off the southwest coast of {place}", "zh": "{place}西南海域", "zh-TW": "{place}西南海域", "ko": "{place} 남서쪽 앞바다",
        "vi": "Ngoài khơi tây nam {place}", "th": "นอกชายฝั่งตะวันตกเฉียงใต้ของ {place}", "id": "Lepas pantai barat daya {place}",
        "ms": "Luar pantai barat daya {place}", "tl": "Timog-kanlurang baybayin ng {place}",
        "fr": "Au large au sud-ouest de {place}", "de": "Südwestlich vor der Küste der {place}",
        "it": "Al largo a sud-ovest di {place}", "es": "Frente a la costa suroeste de {place}",
        "ne": "{place}को दक्षिणपश्चिमी तटमा", "easy_ja": "{place} の みなみにしの うみ",
    },
}

#: 地形そのものを表す語。基底地名に直接付く。
#: 「島」「半島」をここで扱うのは、ラテン系言語では地形語を訳し分けるため
#: （既存訳も "péninsule de Noto" / "Noto Peninsula" と訳している）。
#: 慣用の英名が融合している島（奄美大島・硫黄島・父島）は PLACES 側に
#: 完全形で持たせ、分解より先に照合する。
PLACE_TYPES: dict[str, dict[str, str]] = {
    "地方": {
        "en": "{place} Region", "zh": "{place}地方", "zh-TW": "{place}地方", "ko": "{place} 지방",
        "vi": "Vùng {place}", "th": "ภูมิภาค {place}", "id": "Wilayah {place}",
        "ms": "Wilayah {place}", "tl": "Rehiyon ng {place}", "fr": "la région de {place}",
        "de": "Region {place}", "it": "la regione di {place}", "es": "la región de {place}",
        "ne": "{place} क्षेत्र", "easy_ja": "{place}",
    },
    "湾": {
        "en": "{place} Bay", "zh": "{place}湾", "zh-TW": "{place}灣", "ko": "{place}만",
        "vi": "Vịnh {place}", "th": "อ่าว {place}", "id": "Teluk {place}",
        "ms": "Teluk {place}", "tl": "Look ng {place}", "fr": "la baie de {place}",
        "de": "Bucht von {place}", "it": "la baia di {place}", "es": "la bahía de {place}",
        "ne": "{place} खाडी", "easy_ja": "{place}わん",
    },
    "灘": {
        "en": "{place} Sea", "zh": "{place}滩", "zh-TW": "{place}灘", "ko": "{place} 해역",
        "vi": "Biển {place}", "th": "ทะเล {place}", "id": "Laut {place}",
        "ms": "Laut {place}", "tl": "Dagat ng {place}", "fr": "la mer de {place}",
        "de": "{place}-Meer", "it": "il mare di {place}", "es": "el mar de {place}",
        "ne": "{place} समुद्र", "easy_ja": "{place}なだ",
    },
    "水道": {
        "en": "{place} Channel", "zh": "{place}水道", "zh-TW": "{place}水道", "ko": "{place} 수도",
        "vi": "Eo biển {place}", "th": "ช่องแคบ {place}", "id": "Selat {place}",
        "ms": "Selat {place}", "tl": "Kipot ng {place}", "fr": "le détroit de {place}",
        "de": "{place}-Kanal", "it": "il canale di {place}", "es": "el canal de {place}",
        "ne": "{place} जलसन्धि", "easy_ja": "{place}すいどう",
    },
    "半島": {
        "en": "{place} Peninsula", "zh": "{place}半岛", "zh-TW": "{place}半島", "ko": "{place}반도",
        "vi": "bán đảo {place}", "th": "คาบสมุทร {place}", "id": "Semenanjung {place}",
        "ms": "Semenanjung {place}", "tl": "Tangway ng {place}", "fr": "la péninsule de {place}",
        "de": "{place}-Halbinsel", "it": "la penisola di {place}", "es": "la península de {place}",
        "ne": "{place} प्रायद्वीप", "easy_ja": "{place}はんとう",
    },
    "島": {
        "en": "{place} Island", "zh": "{place}岛", "zh-TW": "{place}島", "ko": "{place}섬",
        "vi": "đảo {place}", "th": "เกาะ {place}", "id": "Pulau {place}",
        "ms": "Pulau {place}", "tl": "Isla ng {place}", "fr": "l'île de {place}",
        "de": "Insel {place}", "it": "l'isola di {place}", "es": "la isla de {place}",
        "ne": "{place} टापु", "easy_ja": "{place}じま",
    },
    "本島": {
        "en": "{place} Main Island", "zh": "{place}本岛", "zh-TW": "{place}本島", "ko": "{place} 본섬",
        "vi": "đảo chính {place}", "th": "เกาะหลัก {place}", "id": "Pulau utama {place}",
        "ms": "Pulau utama {place}", "tl": "Pangunahing isla ng {place}", "fr": "l'île principale d'{place}",
        "de": "Hauptinsel {place}", "it": "l'isola principale di {place}", "es": "la isla principal de {place}",
        "ne": "{place} मुख्य टापु", "easy_ja": "{place}ほんとう",
    },
    "列島": {
        "en": "{place} Islands", "zh": "{place}列岛", "zh-TW": "{place}列島", "ko": "{place} 열도",
        "vi": "quần đảo {place}", "th": "หมู่เกาะ {place}", "id": "Kepulauan {place}",
        "ms": "Kepulauan {place}", "tl": "Kapuluan ng {place}", "fr": "les îles {place}",
        "de": "{place}-Inseln", "it": "le isole {place}", "es": "las islas {place}",
        "ne": "{place} टापुहरू", "easy_ja": "{place}れっとう",
    },
    "諸島": {
        "en": "{place} Islands", "zh": "{place}群岛", "zh-TW": "{place}群島", "ko": "{place} 제도",
        "vi": "quần đảo {place}", "th": "หมู่เกาะ {place}", "id": "Kepulauan {place}",
        "ms": "Kepulauan {place}", "tl": "Kapuluan ng {place}", "fr": "les îles {place}",
        "de": "{place}-Inseln", "it": "le isole {place}", "es": "las islas {place}",
        "ne": "{place} टापुहरू", "easy_ja": "{place}しょとう",
    },
}

#: 基底地名を都道府県で限定するときの並び。`{core}` が組み立て済みの地名、
#: `{pref}` が都道府県（ラテン系では「県」に当たる語込み）。
#: 既存 82 件の訳し方（例: 石川県能登地方 → "Noto Region, Ishikawa Prefecture"）に合わせている。
QUALIFIER: dict[str, str] = {
    "en": "{core}, {pref}",
    "zh": "{pref}{core}",
    "zh-TW": "{pref}{core}",
    "ko": "{pref} {core}",
    "vi": "{core}, {pref}",
    "th": "{core} {pref}",
    "id": "{core}, {pref}",
    "ms": "{core}, {pref}",
    "tl": "{core}, {pref}",
    "fr": "{core}, {pref}",
    "de": "{core}, {pref}",
    "it": "{core}, {pref}",
    "es": "{core}, {pref}",
    "ne": "{pref}को {core}",
    "easy_ja": "{pref} {core}",
}

#: 遠地地震の「国、地域」を並べるときの区切り。中国語・日本語は読点を使う。
_LIST_SEPARATOR: dict[str, str] = {
    "zh": "、", "zh-TW": "、", "easy_ja": "、", "ko": ", ", "th": " ",
}

#: 固有名詞をラテン文字で置く言語（モジュール冒頭の th / ne の注記を参照）
_LATIN_LANGS = frozenset({"en", "vi", "th", "id", "ms", "tl", "fr", "de", "it", "es", "ne"})

SUPPORTED_LANGS = frozenset(_LATIN_LANGS | {"zh", "zh-TW", "ko", "easy_ja"})

def _tail_re(keys) -> re.Pattern[str]:
    """末尾に来る語の照合パターン。

    `沿岸北部` を `北部` と、`東方沖` を `沖` と取り違えないことが要点だが、
    それを担保しているのは**並び順ではなく `search` が最左マッチを返すこと**。
    `東方沖` の方が `沖` より前の位置から始まるので、選択肢の順番に関わらず
    長い方が採られる（順序を逆にしてもミューテーションが素通りすることで確認済み）。
    長い順に並べているのは可読性のためで、正しさはここに依存していない。
    """
    return re.compile("(" + "|".join(sorted(keys, key=len, reverse=True)) + ")$")


_RELATION_RE = _tail_re(RELATIONS)
_MODIFIER_RE = _tail_re(MODIFIERS)
_PLACE_TYPE_RE = _tail_re(PLACE_TYPES)
_PREFECTURE_RE = re.compile("^(" + "|".join(
    sorted((k for k in PLACES if k[-1] in "都道府県" and len(k) >= 3), key=len, reverse=True)
) + ")")


def _elide_fr(name: str) -> str:
    """フランス語の de のエリジオン。母音と無音の h の前で d' になる。

    既存の訳が "préfecture d'Ibaraki" / "préfecture de Fukushima" と
    使い分けているので、機械的に合わせる。
    """
    return f"d'{name}" if name[:1].upper() in "AEIOUYH" else f"de {name}"


def _place_name(ja: str, lang: str) -> Optional[str]:
    """地名 1 つを対象言語の表記にする。未収録なら None。"""
    entry = PLACES.get(ja)
    if entry is None:
        return None
    # 外名がある地名（東京 → 独西では Tokio、日本海 → 仏では mer du Japon）は
    # 音訳より優先する。無い地名がほとんどなので既定は音訳のまま
    override = entry.get("overrides")
    if isinstance(override, dict) and lang in override:
        return override[lang]
    if lang == "easy_ja":
        return entry["kana"]
    if lang in ("zh", "zh-TW", "ko"):
        return entry[lang]
    if lang not in _LATIN_LANGS:
        return None
    name = entry["latin"]
    if entry["kind"] != _P:
        return name
    marker = LATIN_PREFECTURE_MARKER.get(lang)
    if marker is None:
        return name
    return marker.format(n=name, de=_elide_fr(name))


class Parsed(NamedTuple):
    """震源地名の分解結果。

    `[都道府県] [基底地名] [地形語] [修飾語] [位置関係]` の並びで、
    日本語の語順とそのまま対応する。

        熊本県天草・芦北地方 = 熊本県 + 天草・芦北 + 地方
        房総半島南方沖       =        + 房総       + 半島 +        + 南方沖
        釧路地方中南部       =        + 釧路       + 地方 + 中南部
        岩手県沿岸北部       = 岩手県 +            +      + 沿岸北部
    """

    prefecture: str
    base: str
    place_type: str
    modifier: str
    relation: str


# ----------------------------------------------------------------------
# 文法の後処理
# ----------------------------------------------------------------------
#: 前置詞と冠詞の縮約。地名表現に冠詞を持たせる設計にしたため、
#: テンプレートの前置詞と連結したときに縮約が必要になる。
#: （fr: de+le→du / es: de+el→del / it: di+la→della …）
_CONTRACTIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "fr": (("de le ", "du "), ("de les ", "des "), ("De le ", "Du "), ("De les ", "Des ")),
    "es": (("de el ", "del "), ("a el ", "al "), ("De el ", "Del "), ("A el ", "Al ")),
    "it": (
        ("di la ", "della "), ("di il ", "del "), ("di le ", "delle "), ("di l'", "dell'"),
        ("a la ", "alla "), ("a il ", "al "), ("a le ", "alle "), ("a l'", "all'"),
        ("Di la ", "Della "), ("Di il ", "Del "),
    ),
}

#: 限定句に埋め込むときに落とす冠詞。既存訳が
#: "Région de Noto, préfecture d'Ishikawa" のように冠詞を置かないため。
_LEADING_ARTICLES: dict[str, tuple[str, ...]] = {
    "fr": ("la ", "le ", "les ", "l'"),
    "es": ("la ", "el ", "las ", "los "),
    "it": ("la ", "il ", "le ", "l'"),
}


#: フランス語で de がエリジオンする前の母音。固有名詞の前でだけ当てたいので
#: 大文字だけを対象にする（"de la préfecture" のような小文字の普通名詞には当たらない）。
_FR_ELISION_VOWELS = "AEIOUYÉÈÀ"


def _is_prefecture(name: str) -> bool:
    """都道府県そのものか。`大阪`（湾の一部）と `大阪府` を区別する必要がある。"""
    return name in PLACES and len(name) >= 3 and name[-1] in "都道府県"


def _elide_fr_text(text: str) -> str:
    """"Région de Amakusa" を "Région d'Amakusa" にする。

    正規表現を使わないのは、このリポジトリで正規表現の
    バックスラッシュがツール経由で制御文字に化ける事故が繰り返し起きているため。
    """
    for vowel in _FR_ELISION_VOWELS:
        text = text.replace("de " + vowel, "d'" + vowel)
    return text


def _strip_article(text: str, lang: str) -> str:
    for article in _LEADING_ARTICLES.get(lang, ()):
        if text.startswith(article):
            return text[len(article):]
    return text


def _finish(text: str, lang: str) -> str:
    """縮約を適用し、文頭を大文字にする。

    大文字化はラテン文字を使う言語だけに掛ける。日本語・中国語・韓国語・
    タイ語・デーヴァナーガリーには大文字小文字の別が無く、
    `str.capitalize()` は 2 文字目以降を小文字に潰すので使わない。
    """
    for old, new in _CONTRACTIONS.get(lang, ()):
        text = text.replace(old, new)
    if lang == "fr":
        # 固有名詞の前のエリジオン。"Région de Amakusa" → "Région d'Amakusa"。
        # 大文字で始まる語だけを対象にするので、"de la préfecture" には当たらない
        text = _elide_fr_text(text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    if lang in _LATIN_LANGS and text[:1].islower():
        text = text[0].upper() + text[1:]
    return text


def parse(name: str) -> Optional[Parsed]:
    """震源地名を分解する。地名が取り出せなければ None。

    剥がす順は日本語の語順の逆、すなわち 位置関係 → 修飾語 → 地形語 → 都道府県。

    地形語を剥がす前に **残りが丸ごと PLACES にあるかを先に見る**。
    `奄美大島` `硫黄島` `父島` のように慣用の英名が融合している島を
    `奄美大` + `島` のように割ってしまわないため。
    """
    rest = (name or "").strip()
    if not rest:
        return None

    relation = ""
    match = _RELATION_RE.search(rest)
    if match:
        relation = match.group(1)
        rest = rest[: match.start()]

    modifier = ""
    match = _MODIFIER_RE.search(rest)
    if match:
        modifier = match.group(1)
        rest = rest[: match.start()]

    # 融合形を先に照合する。ただし都道府県はここで止めない —
    # 止めると `福島県沖` の福島県が基底地名の枠に入り、
    # 都道府県として扱うべきものが限定句の対象から外れてしまう
    if rest in PLACES and not _is_prefecture(rest):
        return Parsed("", rest, "", modifier, relation)

    place_type = ""
    match = _PLACE_TYPE_RE.search(rest)
    if match and rest[: match.start()]:
        place_type = match.group(1)
        rest = rest[: match.start()]

    prefecture = ""
    match = _PREFECTURE_RE.match(rest)
    if match:
        prefecture = match.group(1)
        rest = rest[match.end():]

    if not (prefecture or rest):
        # 修飾語や地形語だけが残った形。地名が無いので組み立てられない
        return None
    if not prefecture and rest in PLACE_TYPES:
        # `地方` のように地形語だけが単独で来た形。固有名詞が無い
        return None
    return Parsed(prefecture, rest, place_type, modifier, relation)


def compose(name: str, lang: str) -> Optional[str]:
    """震源地名を対象言語で組み立てる。組み立てられなければ None。

    None を返したときは呼び出し側が従来どおり日本語のまま返す。
    部分的に日本語が混ざった文字列は返さない — 中途半端な出力より、
    元の表記のままの方が地図や標識と突き合わせやすいと判断した。
    """
    if lang not in SUPPORTED_LANGS:
        return None

    # 遠地地震は「インドネシア、フローレス」のように読点で国と地域を並べる。
    # どちらかが未収録なら全体を諦める（片方だけ訳した形は出さない）
    if "、" in name:
        parts = [compose(part.strip(), lang) for part in name.split("、") if part.strip()]
        if not parts or any(part is None for part in parts):
            return None
        return _finish(_LIST_SEPARATOR.get(lang, ", ").join(parts), lang)
    parsed = parse(name)
    if parsed is None:
        return None

    pref_text = _place_name(parsed.prefecture, lang) if parsed.prefecture else None
    if parsed.prefecture and pref_text is None:
        return None

    base_text = _place_name(parsed.base, lang) if parsed.base else None
    if parsed.base and base_text is None:
        return None

    # 地形語は基底地名に付く。基底地名が無ければ都道府県そのものが場所になる
    core = base_text if base_text is not None else pref_text
    if core is None:
        return None

    for table, key in (
        (PLACE_TYPES, parsed.place_type),
        (MODIFIERS, parsed.modifier),
        (RELATIONS, parsed.relation),
    ):
        if not key:
            continue
        template = table[key].get(lang)
        if template is None:
            return None
        core = template.format(place=core)

    # 基底地名を使ったときだけ、都道府県で限定する。
    # 限定句では冠詞を落とす（既存訳が "Région de Noto, préfecture d'Ishikawa" の形）
    if base_text is not None and pref_text is not None:
        qualifier = QUALIFIER.get(lang)
        if qualifier is None:
            return None
        core = qualifier.format(
            core=_strip_article(core, lang),
            pref=_strip_article(pref_text, lang),
        )

    return _finish(core, lang)


def localize_prefecture(area_name: str, lang: str) -> Optional[str]:
    """「熊本県阿蘇市」のような市町村名から都道府県だけを取り出して訳す。

    市町村は全国に 1700 以上あり訳を持てない。一方で訪日客にとって必要なのは
    「どの都道府県か」であって市の粒度ではないので、頭の都道府県だけを訳して返す。
    都道府県で始まらない名前（「東京都八丈支庁」の支庁名など）は
    都道府県部分だけが取れる。まったく一致しなければ None。
    """
    match = _PREFECTURE_RE.match((area_name or "").strip())
    if not match:
        return None
    name = _place_name(match.group(1), lang)
    if name is None:
        return None
    # 単独で並べるので冠詞は落として文頭を大文字にする
    # （"la préfecture de Kagoshima" ではなく "Préfecture de Kagoshima"）
    return _finish(_strip_article(name, lang), lang)
