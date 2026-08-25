# -*- coding: utf-8 -*-
"""噴火警戒レベルと噴火警報の種別を 16 言語で表す。

## 出典と対応関係

気象庁の噴火警戒レベルは 1〜5 で、レベルごとに「キーワード」と
「とるべき防災対応」が定められている。ここに載せる日本語はその公式表記で、
独自の観光向け助言は足していない（一次資料から逸脱すると検証できなくなるため）。

    レベル5 避難           危険な居住地域からの避難等
    レベル4 高齢者等避難   警戒が必要な居住地域での高齢者等の要配慮者の避難、住民の避難の準備
    レベル3 入山規制       登山禁止・入山規制等、状況に応じて高齢者等の要配慮者の避難準備
    レベル2 火口周辺規制   火口周辺への立入規制等
    レベル1 活火山であることに留意   火口内等への立入規制等

UI の重大度は**利用者が取る行動**で決める。気象庁の警報種別（噴火予報 /
火口周辺警報 / 噴火警報）をそのまま写すと、レベル2 が「警報」として赤で並び、
実データでは 14 件中 9 件が赤になった。訪日客にとってレベル2 は
「火口の縁が閉鎖されている」であって、いる場所が危険という意味ではない。
赤が並ぶと本当に行けない山（レベル3）が埋もれる。

    レベル5          避難           → extreme  居住地域から避難している
    レベル4          高齢者等避難   → high     居住地域で避難が始まっている
    レベル3          入山規制       → high     その山には入れない（旅程に直接効く）
    レベル2          火口周辺規制   → advisory 火口の縁だけが閉鎖
    レベル1          留意           → advisory 通常どおり

レベル制でない火山も同じ基準で置く（入山できないなら high、海域なら advisory）。

## レベル制を採らない火山

海底火山や無人島の火山にはレベルが振られず、警報の種別名だけが出る
（実データで観測したのは 火口周辺危険 / 入山危険 / 周辺海域警戒 の 3 種）。
これらは `WARNING_TYPES` で扱う。表に無い名前が来たときは
`GENERIC_WARNING` に落として、日本語をそのまま画面へ出さない。

## 火山名の表記について

火山名は気象庁の `volcano_list.json` が `name_jp` と **`name_en`** を持っており、
英字表記は公式のものを使える。中国語圏は日本語の漢字表記をそのまま使い、
それ以外の言語（韓国語・タイ語・ネパール語を含む）は `name_en` を使う。
音訳を自前で作らないための判断で、`location_composer` の th / ne と同じ方針。
"""
from __future__ import annotations

from typing import Optional

LANGS = (
    "ja", "en", "zh", "zh-TW", "ko", "vi", "th", "id",
    "ms", "tl", "ne", "fr", "de", "it", "es", "easy_ja",
)

#: レベル → UI の重大度。冒頭の表のとおり「利用者が取る行動」で決める
LEVEL_SEVERITY: dict[int, str] = {1: "advisory", 2: "advisory", 3: "high", 4: "high", 5: "extreme"}

#: レベルのキーワード（気象庁の公式表記）
LEVEL_NAMES: dict[int, dict[str, str]] = {
    1: {
        "ja": "活火山であることに留意", "en": "Be aware it is an active volcano",
        "zh": "注意这是活火山", "zh-TW": "注意這是活火山", "ko": "활화산임에 유의",
        "vi": "Lưu ý đây là núi lửa đang hoạt động", "th": "โปรดระวังว่าเป็นภูเขาไฟที่ยังคุกรุ่น",
        "id": "Waspadai bahwa ini gunung berapi aktif", "ms": "Sedar bahawa ini gunung berapi aktif",
        "tl": "Tandaan na ito ay aktibong bulkan", "ne": "यो सक्रिय ज्वालामुखी हो भन्ने ध्यान दिनुहोस्",
        "fr": "Attention, volcan actif", "de": "Beachten Sie: aktiver Vulkan",
        "it": "Attenzione: vulcano attivo", "es": "Tenga en cuenta que es un volcán activo",
        "easy_ja": "いまも かつどう している やまです",
    },
    2: {
        "ja": "火口周辺規制", "en": "Access restricted around the crater",
        "zh": "火山口周边限制进入", "zh-TW": "火山口周邊限制進入", "ko": "분화구 주변 통제",
        "vi": "Hạn chế ra vào quanh miệng núi lửa", "th": "จำกัดการเข้าพื้นที่รอบปากปล่องภูเขาไฟ",
        "id": "Akses dibatasi di sekitar kawah", "ms": "Akses dihadkan di sekitar kawah",
        "tl": "Limitado ang pagpasok sa paligid ng bunganga", "ne": "क्रेटर वरिपरि प्रवेश निषेध",
        "fr": "Accès réglementé autour du cratère", "de": "Zugang rund um den Krater eingeschränkt",
        "it": "Accesso limitato intorno al cratere", "es": "Acceso restringido alrededor del cráter",
        "easy_ja": "かこうの まわりに はいれません",
    },
    3: {
        "ja": "入山規制", "en": "Climbing restricted",
        "zh": "禁止登山", "zh-TW": "禁止登山", "ko": "입산 통제",
        "vi": "Hạn chế leo núi", "th": "จำกัดการขึ้นเขา",
        "id": "Pendakian dibatasi", "ms": "Pendakian dihadkan",
        "tl": "Limitado ang pag-akyat", "ne": "पर्वतारोहणमा प्रतिबन्ध",
        "fr": "Ascension réglementée", "de": "Besteigung eingeschränkt",
        "it": "Salita soggetta a restrizioni", "es": "Ascenso restringido",
        "easy_ja": "やまに のぼれません",
    },
    4: {
        "ja": "高齢者等避難", "en": "Evacuation of older residents and others",
        "zh": "高龄者等避难", "zh-TW": "高齡者等避難", "ko": "고령자 등 대피",
        "vi": "Sơ tán người cao tuổi và người cần hỗ trợ", "th": "อพยพผู้สูงอายุและผู้ที่ต้องการความช่วยเหลือ",
        "id": "Evakuasi lansia dan yang membutuhkan bantuan", "ms": "Pemindahan warga emas dan yang memerlukan bantuan",
        "tl": "Paglikas ng mga matatanda at iba pa", "ne": "वृद्ध तथा सहायता चाहिनेको स्थानान्तरण",
        "fr": "Évacuation des personnes âgées et vulnérables", "de": "Evakuierung älterer und hilfsbedürftiger Personen",
        "it": "Evacuazione di anziani e persone vulnerabili", "es": "Evacuación de personas mayores y vulnerables",
        "easy_ja": "としより などは にげて ください",
    },
    5: {
        "ja": "避難", "en": "Evacuate",
        "zh": "避难", "zh-TW": "避難", "ko": "대피",
        "vi": "Sơ tán", "th": "อพยพ",
        "id": "Evakuasi", "ms": "Pindah",
        "tl": "Lumikas", "ne": "स्थानान्तरण गर्नुहोस्",
        "fr": "Évacuer", "de": "Evakuieren",
        "it": "Evacuare", "es": "Evacuar",
        "easy_ja": "にげて ください",
    },
}

#: レベルごとの「とるべき防災対応」（気象庁の公式表記の訳）
LEVEL_ACTIONS: dict[int, dict[str, str]] = {
    1: {
        "ja": "火口内等への立入規制等が行われます。", "en": "Access to the crater and similar areas is restricted.",
        "zh": "火山口内等区域将被限制进入。", "zh-TW": "火山口內等區域將被限制進入。",
        "ko": "분화구 내부 등에 대한 출입이 통제됩니다.", "vi": "Việc ra vào miệng núi lửa và khu vực tương tự bị hạn chế.",
        "th": "มีการจำกัดการเข้าพื้นที่ปากปล่องภูเขาไฟและบริเวณใกล้เคียง",
        "id": "Akses ke kawah dan area serupa dibatasi.", "ms": "Akses ke kawah dan kawasan serupa dihadkan.",
        "tl": "Pinaghihigpitan ang pagpasok sa bunganga at katulad na lugar.",
        "ne": "क्रेटर र त्यस्तै क्षेत्रमा प्रवेश निषेध गरिन्छ।",
        "fr": "L'accès au cratère et aux zones similaires est réglementé.",
        "de": "Der Zugang zum Krater und ähnlichen Bereichen ist eingeschränkt.",
        "it": "L'accesso al cratere e alle aree simili è limitato.",
        "es": "Se restringe el acceso al cráter y zonas similares.",
        "easy_ja": "かこうの なかには はいれません。",
    },
    2: {
        "ja": "火口周辺への立入規制等が行われます。", "en": "Access to the area around the crater is restricted.",
        "zh": "火山口周边将被限制进入。", "zh-TW": "火山口周邊將被限制進入。",
        "ko": "분화구 주변에 대한 출입이 통제됩니다.", "vi": "Việc ra vào khu vực quanh miệng núi lửa bị hạn chế.",
        "th": "มีการจำกัดการเข้าพื้นที่รอบปากปล่องภูเขาไฟ",
        "id": "Akses ke area sekitar kawah dibatasi.", "ms": "Akses ke kawasan sekitar kawah dihadkan.",
        "tl": "Pinaghihigpitan ang pagpasok sa paligid ng bunganga.",
        "ne": "क्रेटर वरिपरिको क्षेत्रमा प्रवेश निषेध गरिन्छ।",
        "fr": "L'accès aux abords du cratère est réglementé.",
        "de": "Der Zugang zum Kraterumfeld ist eingeschränkt.",
        "it": "L'accesso all'area intorno al cratere è limitato.",
        "es": "Se restringe el acceso al entorno del cráter.",
        "easy_ja": "かこうの まわりには はいれません。",
    },
    3: {
        "ja": "登山禁止・入山規制等が行われます。状況に応じて高齢者等の避難準備が行われます。",
        "en": "Climbing is prohibited and access is restricted. Depending on the situation, older residents and others may be asked to prepare to evacuate.",
        "zh": "禁止登山并限制入山。视情况，高龄者等将准备避难。",
        "zh-TW": "禁止登山並限制入山。視情況，高齡者等將準備避難。",
        "ko": "등산이 금지되고 입산이 통제됩니다. 상황에 따라 고령자 등의 대피 준비가 이루어집니다.",
        "vi": "Cấm leo núi và hạn chế ra vào. Tùy tình hình, người cao tuổi có thể được yêu cầu chuẩn bị sơ tán.",
        "th": "ห้ามขึ้นเขาและจำกัดการเข้าพื้นที่ ตามสถานการณ์อาจมีการเตรียมอพยพผู้สูงอายุ",
        "id": "Pendakian dilarang dan akses dibatasi. Sesuai situasi, lansia dan lainnya bersiap untuk evakuasi.",
        "ms": "Pendakian dilarang dan akses dihadkan. Mengikut keadaan, warga emas bersiap untuk berpindah.",
        "tl": "Ipinagbabawal ang pag-akyat at limitado ang pagpasok. Depende sa sitwasyon, maaaring maghanda sa paglikas ang mga matatanda.",
        "ne": "पर्वतारोहण निषेध र प्रवेशमा प्रतिबन्ध लगाइन्छ। अवस्था अनुसार वृद्धहरूको स्थानान्तरण तयारी गरिन्छ।",
        "fr": "L'ascension est interdite et l'accès réglementé. Selon la situation, les personnes âgées se préparent à évacuer.",
        "de": "Besteigung verboten und Zugang eingeschränkt. Je nach Lage bereiten sich ältere Personen auf eine Evakuierung vor.",
        "it": "La salita è vietata e l'accesso limitato. A seconda della situazione, gli anziani si preparano a evacuare.",
        "es": "Se prohíbe el ascenso y se restringe el acceso. Según la situación, las personas mayores se preparan para evacuar.",
        "easy_ja": "やまに のぼっては いけません。ばあいに よって としよりは にげる じゅんびを します。",
    },
    4: {
        "ja": "警戒が必要な居住地域で、高齢者等の避難と、住民の避難の準備が行われます。",
        "en": "In residential areas at risk, older residents and others evacuate, and other residents prepare to evacuate.",
        "zh": "在需要警戒的居住区域，高龄者等将避难，居民将准备避难。",
        "zh-TW": "在需要警戒的居住區域，高齡者等將避難，居民將準備避難。",
        "ko": "경계가 필요한 거주 지역에서 고령자 등이 대피하고, 주민은 대피를 준비합니다.",
        "vi": "Tại khu dân cư cần cảnh giác, người cao tuổi sơ tán và cư dân khác chuẩn bị sơ tán.",
        "th": "ในพื้นที่อยู่อาศัยที่ต้องเฝ้าระวัง ผู้สูงอายุจะอพยพ และผู้อยู่อาศัยเตรียมอพยพ",
        "id": "Di area permukiman yang berisiko, lansia dievakuasi dan warga lain bersiap evakuasi.",
        "ms": "Di kawasan kediaman berisiko, warga emas berpindah dan penduduk lain bersiap berpindah.",
        "tl": "Sa mga tirahang nanganganib, lumilikas ang mga matatanda at naghahanda ang iba pang residente.",
        "ne": "जोखिममा रहेका बस्तीहरूमा वृद्धहरू स्थानान्तरण गर्छन् र अन्य बासिन्दा तयारी गर्छन्।",
        "fr": "Dans les zones habitées menacées, les personnes âgées évacuent et les autres habitants s'y préparent.",
        "de": "In gefährdeten Wohngebieten evakuieren ältere Personen; andere Bewohner bereiten sich vor.",
        "it": "Nelle aree abitate a rischio, gli anziani evacuano e gli altri residenti si preparano.",
        "es": "En zonas habitadas en riesgo, las personas mayores evacuan y el resto se prepara.",
        "easy_ja": "あぶない ちいきでは としよりが にげます。ほかの ひとも じゅんびを します。",
    },
    5: {
        "ja": "危険な居住地域からの避難等が行われます。",
        "en": "Residents evacuate from dangerous residential areas.",
        "zh": "居民将从危险的居住区域避难。", "zh-TW": "居民將從危險的居住區域避難。",
        "ko": "위험한 거주 지역에서 대피가 이루어집니다.",
        "vi": "Cư dân sơ tán khỏi các khu dân cư nguy hiểm.",
        "th": "ผู้อยู่อาศัยจะอพยพออกจากพื้นที่อยู่อาศัยที่อันตราย",
        "id": "Warga dievakuasi dari area permukiman berbahaya.",
        "ms": "Penduduk berpindah dari kawasan kediaman berbahaya.",
        "tl": "Lumilikas ang mga residente mula sa mapanganib na tirahan.",
        "ne": "खतरनाक बस्तीहरूबाट बासिन्दाहरू स्थानान्तरण गर्छन्।",
        "fr": "Les habitants évacuent les zones habitées dangereuses.",
        "de": "Bewohner evakuieren gefährdete Wohngebiete.",
        "it": "I residenti evacuano dalle aree abitate pericolose.",
        "es": "Los residentes evacuan de las zonas habitadas peligrosas.",
        "easy_ja": "あぶない ところから にげます。",
    },
}

#: レベル制を採らない火山の警報種別。実データで観測した 3 種と、
#: レベル 1 相当の予報名を収録する。
WARNING_TYPES: dict[str, dict[str, str]] = {
    "火口周辺危険": {
        "severity": "high",
        "ja": "火口周辺危険", "en": "Danger near the crater",
        "zh": "火山口周边危险", "zh-TW": "火山口周邊危險", "ko": "분화구 주변 위험",
        "vi": "Nguy hiểm quanh miệng núi lửa", "th": "อันตรายบริเวณปากปล่องภูเขาไฟ",
        "id": "Bahaya di sekitar kawah", "ms": "Bahaya di sekitar kawah",
        "tl": "Panganib malapit sa bunganga", "ne": "क्रेटर वरिपरि खतरा",
        "fr": "Danger aux abords du cratère", "de": "Gefahr im Kraterumfeld",
        "it": "Pericolo nei pressi del cratere", "es": "Peligro cerca del cráter",
        "easy_ja": "かこうの まわりは あぶないです",
    },
    "入山危険": {
        "severity": "high",
        "ja": "入山危険", "en": "Danger — do not enter the volcano",
        "zh": "入山危险", "zh-TW": "入山危險", "ko": "입산 위험",
        "vi": "Nguy hiểm — không vào khu vực núi lửa", "th": "อันตราย ห้ามเข้าพื้นที่ภูเขาไฟ",
        "id": "Bahaya — dilarang memasuki gunung", "ms": "Bahaya — dilarang memasuki gunung",
        "tl": "Delikado — huwag pumasok sa bulkan", "ne": "खतरा — ज्वालामुखी क्षेत्रमा नजानुहोस्",
        "fr": "Danger — ne pas pénétrer sur le volcan", "de": "Gefahr — Vulkan nicht betreten",
        "it": "Pericolo — non accedere al vulcano", "es": "Peligro — no acceda al volcán",
        "easy_ja": "やまに はいると あぶないです",
    },
    "周辺海域警戒": {
        "severity": "advisory",
        "ja": "周辺海域警戒", "en": "Caution in surrounding waters",
        "zh": "周边海域警戒", "zh-TW": "周邊海域警戒", "ko": "주변 해역 경계",
        "vi": "Cảnh giác vùng biển xung quanh", "th": "เฝ้าระวังน่านน้ำโดยรอบ",
        "id": "Waspada di perairan sekitar", "ms": "Berwaspada di perairan sekitar",
        "tl": "Mag-ingat sa karatig na karagatan", "ne": "वरपरको समुद्री क्षेत्रमा सतर्कता",
        "fr": "Prudence dans les eaux environnantes", "de": "Vorsicht in den umliegenden Gewässern",
        "it": "Prudenza nelle acque circostanti", "es": "Precaución en las aguas circundantes",
        "easy_ja": "まわりの うみに きを つけて ください",
    },
    "活火山であることに留意": dict(LEVEL_NAMES[1], severity="advisory"),
}

#: 表に無い警報名が来たときの受け皿。日本語をそのまま画面へ出さないための保険。
GENERIC_WARNING: dict[str, str] = {
    "ja": "噴火に関する警報が発表されています", "en": "A volcanic warning is in effect",
    "zh": "已发布火山警报", "zh-TW": "已發布火山警報", "ko": "화산 경보가 발령 중입니다",
    "vi": "Đang có cảnh báo núi lửa", "th": "มีการประกาศเตือนภัยภูเขาไฟ",
    "id": "Peringatan gunung berapi sedang berlaku", "ms": "Amaran gunung berapi sedang berkuat kuasa",
    "tl": "May nakataas na babala sa bulkan", "ne": "ज्वालामुखी सम्बन्धी चेतावनी जारी छ",
    "fr": "Une alerte volcanique est en vigueur", "de": "Eine Vulkanwarnung ist in Kraft",
    "it": "È in vigore un'allerta vulcanica", "es": "Hay una alerta volcánica en vigor",
    "easy_ja": "ふんかの おしらせが でて います",
}

#: 「レベル N」という見出しの言い方
LEVEL_LABEL: dict[str, str] = {
    "ja": "噴火警戒レベル{level}", "en": "Alert Level {level}",
    "zh": "喷发警戒级别{level}", "zh-TW": "噴發警戒級別{level}", "ko": "분화 경계 레벨 {level}",
    "vi": "Mức cảnh báo {level}", "th": "ระดับเตือนภัย {level}",
    "id": "Tingkat Siaga {level}", "ms": "Tahap Amaran {level}",
    "tl": "Antas ng Babala {level}", "ne": "चेतावनी स्तर {level}",
    "fr": "Niveau d'alerte {level}", "de": "Warnstufe {level}",
    "it": "Livello di allerta {level}", "es": "Nivel de alerta {level}",
    "easy_ja": "ふんかの レベル {level}",
}

#: 継続中であることの表示。気象庁は状況が変わらない限り発表日時を更新しないため、
#: 何年も前の日時が「発表時刻」として出ると、今起きたことのように見える。
CONTINUING_LABEL: dict[str, str] = {
    "ja": "継続中", "en": "Ongoing", "zh": "持续中", "zh-TW": "持續中", "ko": "계속 중",
    "vi": "Đang tiếp diễn", "th": "ยังคงมีผล", "id": "Masih berlaku", "ms": "Masih berkuat kuasa",
    "tl": "Nagpapatuloy", "ne": "जारी छ", "fr": "En cours", "de": "Andauernd",
    "it": "In corso", "es": "En curso", "easy_ja": "つづいて います",
}

#: 気象庁側で解除されたことを表す condition。画面に出してはいけない。
LIFTED_CONDITIONS = frozenset({"解除"})

#: 継続を表す condition（発表日時が古くなる）
CONTINUING_CONDITIONS = frozenset({"継続"})


def pick(table: dict[str, str], lang: str) -> str:
    """言語を選ぶ。無ければ英語、それも無ければ日本語。

    日本語へ直接フォールバックしない。読めない文字を出すより、
    多くの利用者が手掛かりを得られる英語の方がましなため。
    """
    return table.get(lang) or table.get("en") or table.get("ja", "")


def level_severity(level: Optional[int]) -> Optional[str]:
    return LEVEL_SEVERITY.get(level) if level is not None else None


#: 火山名を日本語表記のまま出してよい言語。中国語圏は日本語の漢字がそのまま通じる。
_KEEPS_JA_NAME = frozenset({"ja", "easy_ja", "zh", "zh-TW"})


def localize_volcano_name(name_ja: str, name_en: Optional[str], lang: str) -> str:
    """火山名を対象言語の表記にする。

    英字表記は気象庁の `volcano_list.json` が持つ公式のもの（`name_en`）で、
    こちらで音訳を作らない。韓国語・タイ語・ネパール語も英字表記を使う —
    未検証の音訳を作るより、標識や地図と突き合わせられる文字の方が実用的で、
    `location_composer` の th / ne と同じ判断。
    """
    if lang in _KEEPS_JA_NAME or not name_en:
        return name_ja
    return name_en


def localize_warning(
    *, level: Optional[int], name_ja: str, lang: str
) -> tuple[str, str]:
    """警報名ととるべき防災対応を対象言語で返す。

    レベル制の火山はレベルから引く。レベル制でない火山は警報の種別名から引き、
    表に無い名前は総称に落とす（日本語をそのまま画面へ出さないため）。
    """
    if level is not None and level in LEVEL_NAMES:
        return pick(LEVEL_NAMES[level], lang), pick(LEVEL_ACTIONS[level], lang)
    entry = WARNING_TYPES.get(name_ja)
    if entry:
        return pick(entry, lang), ""
    return pick(GENERIC_WARNING, lang), ""
