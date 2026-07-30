"""
気象警報の名称（16言語）

## なぜこのモジュールがあるか

警報名は `warning_service.WARNING_CODES` に直接書かれていたが **6言語のみ**
（ja / en / zh / ko / vi / easy_ja）で、zh-TW・th・id・ms・tl・ne・fr・de・it・es の
ユーザーは「何の警報が出ているのか」を英語で読んでいた。
行動指示は [warning_guidance] で16言語化済みだったため、名前だけ英語という
不揃いな状態だった。

## 設計

警報名は「**災害種別 × 警報レベル**」の規則的な組み合わせである
（例: 大雨 × 警報 = 大雨警報、大雨 × 特別警報 = 大雨特別警報）。
そこでコード別に29×16=464文面を並べるのではなく、

  - `HAZARD_TERMS`: 災害種別 18 語 × 16言語
  - `LEVEL_TERMS`: 警報レベル 3 語 × 16言語
  - `NAME_PATTERN`: 言語ごとの語順（日本語は「種別+レベル」、
     ベトナム語は「レベル+種別」、フランス語は「レベル : 種別」など）

を持ち、import 時に組み立てる。文面数が減るぶん一つ一つを丁寧に書ける。

**既存の6言語の名称は1文字も変えない。** テスト
`test_warning_names.py::TestNoRegression` が、組み立て結果を移行前の
文字列（テスト側に凍結）と全件突合する。

本モジュールは **外部依存を持たない**。
"""

# 言語ごとの語順。{hazard} = 災害種別、{level} = 警報レベル
NAME_PATTERN: dict[str, str] = {
    "ja": "{hazard}{level}",
    "en": "{hazard} {level}",
    "zh": "{hazard}{level}",
    "zh-TW": "{hazard}{level}",
    "ko": "{hazard} {level}",
    "vi": "{level} {hazard}",
    "th": "{level}{hazard}",
    "id": "{level} {hazard}",
    "ms": "{level} {hazard}",
    "tl": "{level}: {hazard}",
    "ne": "{hazard} {level}",
    "fr": "{level} : {hazard}",  # フランス語はコロンの前に空白を入れる
    "de": "{level}: {hazard}",
    "it": "{level}: {hazard}",
    "es": "{level}: {hazard}",
    "easy_ja": "{hazard} {level}",
}

# 警報レベル（警報 / 注意報 / 特別警報）
LEVEL_TERMS: dict[str, dict[str, str]] = {
    "warning": {
        "ja": "警報", "en": "Warning", "zh": "警报", "zh-TW": "警報",
        "ko": "경보", "vi": "Cảnh báo", "th": "คำเตือน", "id": "Peringatan",
        "ms": "Amaran", "tl": "Babala", "ne": "चेतावनी", "fr": "Alerte",
        "de": "Warnung", "it": "Allerta", "es": "Aviso", "easy_ja": "けいほう",
    },
    "advisory": {
        "ja": "注意報", "en": "Advisory", "zh": "注意报", "zh-TW": "注意報",
        "ko": "주의보", "vi": "Chú ý", "th": "ประกาศเฝ้าระวัง", "id": "Waspada",
        "ms": "Makluman", "tl": "Abiso", "ne": "सतर्कता", "fr": "Vigilance",
        "de": "Hinweis", "it": "Avviso", "es": "Precaución", "easy_ja": "ちゅういほう",
    },
    "emergency": {
        "ja": "特別警報", "en": "Emergency Warning", "zh": "特别警报", "zh-TW": "特別警報",
        "ko": "특별 경보", "vi": "Cảnh báo khẩn cấp", "th": "คำเตือนฉุกเฉิน",
        "id": "Peringatan Darurat", "ms": "Amaran Darurat", "tl": "Emergency na Babala",
        "ne": "विशेष चेतावनी", "fr": "Alerte d'urgence", "de": "Notfallwarnung",
        "it": "Allerta d'emergenza", "es": "Aviso de emergencia",
        "easy_ja": "とくべつけいほう",
    },
}

# 災害種別
HAZARD_TERMS: dict[str, dict[str, str]] = {
    "blizzard": {
        "ja": "暴風雪", "en": "Blizzard", "zh": "暴风雪", "zh-TW": "暴風雪",
        "ko": "폭풍설", "vi": "bão tuyết", "th": "พายุหิมะ", "id": "badai salju",
        "ms": "badai salji", "tl": "blizzard", "ne": "हिउँ आँधी", "fr": "blizzard",
        "de": "Schneesturm", "it": "bufera di neve", "es": "ventisca",
        "easy_ja": "ふぶき",
    },
    "heavy_rain": {
        "ja": "大雨", "en": "Heavy Rain", "zh": "大雨", "zh-TW": "大雨",
        "ko": "호우", "vi": "mưa lớn", "th": "ฝนตกหนัก", "id": "hujan lebat",
        "ms": "hujan lebat", "tl": "malakas na ulan", "ne": "भारी वर्षा",
        "fr": "fortes pluies", "de": "Starkregen", "it": "pioggia intensa",
        "es": "lluvia intensa", "easy_ja": "おおあめ",
    },
    "flood": {
        "ja": "洪水", "en": "Flood", "zh": "洪水", "zh-TW": "洪水",
        "ko": "홍수", "vi": "lũ lụt", "th": "น้ำท่วม", "id": "banjir",
        "ms": "banjir", "tl": "pagbaha", "ne": "बाढी", "fr": "inondation",
        "de": "Hochwasser", "it": "alluvione", "es": "inundación",
        "easy_ja": "こうずい",
    },
    "storm": {
        "ja": "暴風", "en": "Storm", "zh": "暴风", "zh-TW": "暴風",
        "ko": "폭풍", "vi": "bão", "th": "ลมพายุ", "id": "badai",
        "ms": "badai", "tl": "bagyo", "ne": "आँधी", "fr": "tempête",
        "de": "Sturm", "it": "tempesta", "es": "tormenta", "easy_ja": "ぼうふう",
    },
    "heavy_snow": {
        "ja": "大雪", "en": "Heavy Snow", "zh": "大雪", "zh-TW": "大雪",
        "ko": "대설", "vi": "tuyết lớn", "th": "หิมะตกหนัก", "id": "salju tebal",
        "ms": "salji tebal", "tl": "makapal na niyebe", "ne": "भारी हिमपात",
        "fr": "fortes chutes de neige", "de": "starker Schneefall",
        "it": "forti nevicate", "es": "nevada intensa", "easy_ja": "おおゆき",
    },
    "high_waves": {
        "ja": "波浪", "en": "High Waves", "zh": "海浪", "zh-TW": "海浪",
        "ko": "파랑", "vi": "sóng lớn", "th": "คลื่นสูง", "id": "gelombang tinggi",
        "ms": "gelombang tinggi", "tl": "malalaking alon", "ne": "उच्च छाल",
        "fr": "fortes vagues", "de": "hohe Wellen", "it": "onde alte",
        "es": "olas altas", "easy_ja": "なみ",
    },
    "storm_surge": {
        "ja": "高潮", "en": "Storm Surge", "zh": "风暴潮", "zh-TW": "暴潮",
        "ko": "해일", "vi": "triều cường", "th": "น้ำทะเลหนุน",
        "id": "gelombang badai", "ms": "air pasang badai", "tl": "storm surge",
        "ne": "समुद्री जलस्तर वृद्धि", "fr": "onde de tempête", "de": "Sturmflut",
        "it": "mareggiata", "es": "marea de tormenta", "easy_ja": "たかしお",
    },
    "wind_snow": {
        "ja": "風雪", "en": "Wind Snow", "zh": "风雪", "zh-TW": "風雪",
        "ko": "풍설", "vi": "gió tuyết", "th": "ลมและหิมะ", "id": "angin dan salju",
        "ms": "angin dan salji", "tl": "hangin at niyebe", "ne": "हावा र हिउँ",
        "fr": "vent et neige", "de": "Wind und Schnee", "it": "vento e neve",
        "es": "viento y nieve", "easy_ja": "ふうせつ",
    },
    "thunder": {
        "ja": "雷", "en": "Thunder", "zh": "雷电", "zh-TW": "雷電",
        "ko": "뇌우", "vi": "sấm sét", "th": "ฟ้าผ่า", "id": "petir",
        "ms": "kilat", "tl": "kidlat", "ne": "चट्याङ", "fr": "orage",
        "de": "Gewitter", "it": "temporale", "es": "tormenta eléctrica",
        "easy_ja": "かみなり",
    },
    "strong_wind": {
        "ja": "強風", "en": "Strong Wind", "zh": "强风", "zh-TW": "強風",
        "ko": "강풍", "vi": "gió mạnh", "th": "ลมแรง", "id": "angin kencang",
        "ms": "angin kuat", "tl": "malakas na hangin", "ne": "तेज हावा",
        "fr": "vent fort", "de": "starker Wind", "it": "vento forte",
        "es": "viento fuerte", "easy_ja": "つよいかぜ",
    },
    "snowmelt": {
        "ja": "融雪", "en": "Snowmelt", "zh": "融雪", "zh-TW": "融雪",
        "ko": "융설", "vi": "tan tuyết", "th": "หิมะละลาย", "id": "salju mencair",
        "ms": "salji mencair", "tl": "natutunaw na niyebe", "ne": "हिउँ पग्लिने",
        "fr": "fonte des neiges", "de": "Schneeschmelze",
        "it": "scioglimento della neve", "es": "deshielo", "easy_ja": "ゆきどけ",
    },
    "dense_fog": {
        "ja": "濃霧", "en": "Dense Fog", "zh": "浓雾", "zh-TW": "濃霧",
        "ko": "짙은 안개", "vi": "sương mù dày", "th": "หมอกหนา",
        "id": "kabut tebal", "ms": "kabus tebal", "tl": "makapal na hamog",
        "ne": "बाक्लो कुहिरो", "fr": "brouillard dense", "de": "dichter Nebel",
        "it": "nebbia densa", "es": "niebla densa", "easy_ja": "きり",
    },
    "dry_air": {
        "ja": "乾燥", "en": "Dry Air", "zh": "干燥", "zh-TW": "乾燥",
        "ko": "건조", "vi": "không khí khô", "th": "อากาศแห้ง",
        "id": "udara kering", "ms": "udara kering", "tl": "tuyong hangin",
        "ne": "सुक्खा हावा", "fr": "air sec", "de": "trockene Luft",
        "it": "aria secca", "es": "aire seco", "easy_ja": "かんそう",
    },
    "avalanche": {
        "ja": "なだれ", "en": "Avalanche", "zh": "雪崩", "zh-TW": "雪崩",
        "ko": "눈사태", "vi": "lở tuyết", "th": "หิมะถล่ม",
        "id": "longsoran salju", "ms": "runtuhan salji", "tl": "avalanche",
        "ne": "हिउँ पहिरो", "fr": "avalanche", "de": "Lawine",
        "it": "valanga", "es": "avalancha", "easy_ja": "なだれ",
    },
    "low_temp": {
        "ja": "低温", "en": "Low Temperature", "zh": "低温", "zh-TW": "低溫",
        "ko": "저온", "vi": "nhiệt độ thấp", "th": "อุณหภูมิต่ำ",
        "id": "suhu rendah", "ms": "suhu rendah", "tl": "mababang temperatura",
        "ne": "न्यून तापक्रम", "fr": "basses températures",
        "de": "niedrige Temperaturen", "it": "basse temperature",
        "es": "temperaturas bajas", "easy_ja": "さむさ",
    },
    "frost": {
        "ja": "霜", "en": "Frost", "zh": "霜冻", "zh-TW": "霜凍",
        "ko": "서리", "vi": "sương giá", "th": "น้ำค้างแข็ง", "id": "embun beku",
        "ms": "embun beku", "tl": "hamog na nagyeyelo", "ne": "तुसारो",
        "fr": "gel", "de": "Frost", "it": "gelo", "es": "escarcha",
        "easy_ja": "しも",
    },
    "icing": {
        "ja": "着氷", "en": "Icing", "zh": "结冰", "zh-TW": "結冰",
        "ko": "착빙", "vi": "đóng băng", "th": "น้ำแข็งเกาะ", "id": "lapisan es",
        "ms": "lapisan ais", "tl": "pag-yelo", "ne": "हिउँ जम्ने",
        "fr": "givre", "de": "Eisbildung", "it": "formazione di ghiaccio",
        "es": "formación de hielo", "easy_ja": "こおり",
    },
    "snow_accretion": {
        "ja": "着雪", "en": "Snow Accretion", "zh": "积雪", "zh-TW": "積雪",
        "ko": "착설", "vi": "tuyết bám", "th": "หิมะเกาะ",
        "id": "salju menempel", "ms": "salji melekat", "tl": "dumidikit na niyebe",
        "ne": "हिउँ टाँसिने", "fr": "accumulation de neige",
        "de": "Schneeanhaftung", "it": "accumulo di neve",
        "es": "acumulación de nieve", "easy_ja": "ゆき",
    },
}

# 気象庁の警報コード → (災害種別, 警報レベル, 重要度)
CODE_SPEC: dict[str, tuple[str, str, str]] = {
    "02": ("blizzard", "warning", "high"),
    "03": ("heavy_rain", "warning", "high"),
    "04": ("flood", "warning", "high"),
    "05": ("storm", "warning", "high"),
    "06": ("heavy_snow", "warning", "high"),
    "07": ("high_waves", "warning", "high"),
    "08": ("storm_surge", "warning", "high"),
    "10": ("heavy_rain", "advisory", "medium"),
    "12": ("heavy_snow", "advisory", "medium"),
    "13": ("wind_snow", "advisory", "medium"),
    "14": ("thunder", "advisory", "medium"),
    "15": ("strong_wind", "advisory", "medium"),
    "16": ("high_waves", "advisory", "medium"),
    "17": ("snowmelt", "advisory", "medium"),
    "18": ("flood", "advisory", "medium"),
    "19": ("storm_surge", "advisory", "medium"),
    "20": ("dense_fog", "advisory", "low"),
    "21": ("dry_air", "advisory", "low"),
    "22": ("avalanche", "advisory", "medium"),
    "23": ("low_temp", "advisory", "low"),
    "24": ("frost", "advisory", "low"),
    "25": ("icing", "advisory", "low"),
    "26": ("snow_accretion", "advisory", "low"),
    "32": ("blizzard", "emergency", "extreme"),
    "33": ("heavy_rain", "emergency", "extreme"),
    "35": ("storm", "emergency", "extreme"),
    "36": ("heavy_snow", "emergency", "extreme"),
    "37": ("high_waves", "emergency", "extreme"),
    "38": ("storm_surge", "emergency", "extreme"),
}

# 説明文テンプレート（16言語）
DESCRIPTION_TEMPLATES: dict[str, str] = {
    "ja": "{area}に{warning}が発表されています。",
    "en": "{warning} has been issued for {area}.",
    "zh": "{area}发布了{warning}。",
    "zh-TW": "{area}發布了{warning}。",
    "ko": "{area}에 {warning}이(가) 발령되었습니다.",
    "vi": "{warning} đã được ban hành cho {area}.",
    "th": "มีการประกาศ{warning}สำหรับ{area}",
    "id": "{warning} telah dikeluarkan untuk {area}.",
    "ms": "{warning} telah dikeluarkan untuk {area}.",
    "tl": "May {warning} para sa {area}.",
    "ne": "{area} मा {warning} जारी गरिएको छ।",
    "fr": "{warning} en vigueur pour {area}.",
    "de": "{warning} für {area} ausgegeben.",
    "it": "{warning} in vigore per {area}.",
    "es": "{warning} en vigor para {area}.",
    "easy_ja": "{area}に {warning}が でています。",
}


def build_warning_names() -> dict[str, dict[str, str]]:
    """
    コード別・言語別の警報名を組み立てる。

    返り値は `{code: {lang: name, ..., "severity": ...}}`。
    `severity` を同じ辞書に含めるのは移行前の `WARNING_CODES` と互換にするため。
    """
    table: dict[str, dict[str, str]] = {}
    for code, (hazard, level, severity) in CODE_SPEC.items():
        entry: dict[str, str] = {}
        for lang, pattern in NAME_PATTERN.items():
            entry[lang] = pattern.format(
                hazard=HAZARD_TERMS[hazard][lang],
                level=LEVEL_TERMS[level][lang],
            )
        entry["severity"] = severity
        table[code] = entry
    return table


# `warning_service.WARNING_CODES` として使われる（移行前と同じ形）
WARNING_NAMES: dict[str, dict[str, str]] = build_warning_names()
