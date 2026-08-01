"""災害時に確認すべき交通の公式情報源リンク集（16言語の見出し付き）

## なぜ必要か

訪日客の災害時ニーズ調査で、**「日程が崩壊した」37.3%（全体4位）・「今後の日程」27.0%・
「交通と空港の情報」22.2%** と交通関連が上位に集中している。希望する対応でも
「交通・飛行機の情報など説明できる案内所」25.4% が入る。

観光庁の検討会も「気象情報や交通情報は主体ごとに発信され一元的に把握できない」ことを
公的課題として挙げている。**運行情報そのものを配信するには各社の API とライセンス調査が要る**ため、
まず「どこを見ればよいか」を言語別に示すリンク集で空白を埋める。

## 設計方針

- **事業者名・空港名は訳さない。** 固有名詞であり、駅や空港の案内表示・券売機に出るのは
  「JR East」「Narita Airport」といった正式表記だから、そのまま出す方が現地で照合できる。
  地域名を公式英語名に寄せたのと同じ判断
- **翻訳するのは分類の見出しだけ**（4分類 × 16言語 = 64件）。リンク1本ごとに16言語の説明文を
  作ると 14 × 16 = 224 件を無レビューで量産することになり、誤訳のリスクに見合わない
- **リンク先が何語で読めるかを併記する。** タイ語話者が「日本語のみ」のページを
  災害のさなかに開いてしまう無駄をなくす。ここを黙っていると親切なようで不親切になる
- **URL は機械的に検証する。** `scripts/verify_transit_links.py` が全リンクの HTTP
  ステータスを確認する。作成時にも 404 を1件踏んでいる（実在しない URL を推測で置いていた）。
  災害時に死にリンクを踏ませるのは、リンクが無いより悪い

## 更新するとき

リンクを足したら **必ず `python scripts/verify_transit_links.py` を通すこと。**
CI には入れていない（外部サイトの都合で落ちる CI は無視されるようになるため）。
"""
from __future__ import annotations

from typing import Literal, NamedTuple

from ..models import ALLOWED_LANGUAGES

Category = Literal["overall", "rail", "air", "road"]


class TransitLink(NamedTuple):
    """交通の公式情報源1本。

    Attributes:
        id: 安定した識別子（フロントの key に使う）
        category: 分類
        name: 事業者・施設の正式名（訳さない）
        url: 既定で開く URL。英語ページがあれば英語を優先する
        url_ja: 日本語ページ（`url` と同じこともある）
        languages: **リンク先が実際に読める言語**。`ja` のみなら日本語専用
        area: 対象エリアの目安（英語表記。訳さない）
    """

    id: str
    category: Category
    name: str
    url: str
    url_ja: str
    languages: tuple[str, ...]
    area: str


#: 分類の見出し（16言語）
CATEGORY_LABELS: dict[Category, dict[str, str]] = {
    "overall": {
        "ja": "全般・ニュース",
        "en": "General & News",
        "zh": "综合与新闻",
        "zh-TW": "綜合與新聞",
        "ko": "종합·뉴스",
        "vi": "Tổng hợp & Tin tức",
        "th": "ภาพรวมและข่าวสาร",
        "id": "Umum & Berita",
        "ms": "Umum & Berita",
        "tl": "Pangkalahatan at Balita",
        "fr": "Général et actualités",
        "de": "Allgemein & Nachrichten",
        "it": "Generale e notizie",
        "es": "General y noticias",
        "ne": "सामान्य र समाचार",
        "easy_ja": "ぜんぶの じょうほう・ニュース",
    },
    "rail": {
        "ja": "鉄道",
        "en": "Trains",
        "zh": "铁路",
        "zh-TW": "鐵路",
        "ko": "철도",
        "vi": "Tàu hỏa",
        "th": "รถไฟ",
        "id": "Kereta",
        "ms": "Kereta Api",
        "tl": "Tren",
        "fr": "Trains",
        "de": "Züge",
        "it": "Treni",
        "es": "Trenes",
        "ne": "रेल",
        "easy_ja": "でんしゃ",
    },
    "air": {
        "ja": "空港・航空",
        "en": "Airports & Flights",
        "zh": "机场与航班",
        "zh-TW": "機場與航班",
        "ko": "공항·항공편",
        "vi": "Sân bay & Chuyến bay",
        "th": "สนามบินและเที่ยวบิน",
        "id": "Bandara & Penerbangan",
        "ms": "Lapangan Terbang & Penerbangan",
        "tl": "Paliparan at Flight",
        "fr": "Aéroports et vols",
        "de": "Flughäfen & Flüge",
        "it": "Aeroporti e voli",
        "es": "Aeropuertos y vuelos",
        "ne": "विमानस्थल र उडान",
        "easy_ja": "ひこうき",
    },
    "road": {
        "ja": "道路・高速道路",
        "en": "Roads & Expressways",
        "zh": "道路与高速公路",
        "zh-TW": "道路與高速公路",
        "ko": "도로·고속도로",
        "vi": "Đường bộ & Cao tốc",
        "th": "ถนนและทางด่วน",
        "id": "Jalan & Jalan Tol",
        "ms": "Jalan Raya & Lebuh Raya",
        "tl": "Kalsada at Expressway",
        "fr": "Routes et autoroutes",
        "de": "Straßen & Autobahnen",
        "it": "Strade e autostrade",
        "es": "Carreteras y autopistas",
        "ne": "सडक र द्रुतमार्ग",
        "easy_ja": "どうろ",
    },
}

#: セクションの見出し（16言語）。多言語文字列はバックエンドに集約する
SECTION_TITLE: dict[str, str] = {
    "ja": "交通の公式情報",
    "en": "Official Transit Information",
    "zh": "官方交通信息",
    "zh-TW": "官方交通資訊",
    "ko": "공식 교통 정보",
    "vi": "Thông tin giao thông chính thức",
    "th": "ข้อมูลการเดินทางอย่างเป็นทางการ",
    "id": "Informasi Transportasi Resmi",
    "ms": "Maklumat Pengangkutan Rasmi",
    "tl": "Opisyal na Impormasyon sa Transportasyon",
    "fr": "Informations officielles sur les transports",
    "de": "Offizielle Verkehrsinformationen",
    "it": "Informazioni ufficiali sui trasporti",
    "es": "Información oficial de transporte",
    "ne": "आधिकारिक यातायात जानकारी",
    "easy_ja": "こうつうの おしらせ",
}

#: 「このページは○○語で読めます」の見出し（16言語）
AVAILABLE_IN_LABEL: dict[str, str] = {
    "ja": "対応言語",
    "en": "Available in",
    "zh": "支持语言",
    "zh-TW": "支援語言",
    "ko": "지원 언어",
    "vi": "Ngôn ngữ",
    "th": "ภาษาที่รองรับ",
    "id": "Tersedia dalam",
    "ms": "Tersedia dalam",
    "tl": "Available sa",
    "fr": "Disponible en",
    "de": "Verfügbar in",
    "it": "Disponibile in",
    "es": "Disponible en",
    "ne": "उपलब्ध भाषा",
    "easy_ja": "よめる ことば",
}

#: 交通の公式情報源。**URL は verify_transit_links.py で実測確認したものだけを置く。**
TRANSIT_LINKS: tuple[TransitLink, ...] = (
    # --- 全般 ---
    TransitLink(
        id="nhk-world",
        category="overall",
        name="NHK WORLD-JAPAN",
        url="https://www3.nhk.or.jp/nhkworld/",
        url_ja="https://www3.nhk.or.jp/nhkworld/",
        languages=("en", "zh", "zh-TW", "ko", "vi", "th", "id", "ms", "fr", "es", "ne"),
        area="Nationwide",
    ),
    TransitLink(
        id="jnto-safety-tips",
        category="overall",
        name="JNTO Japan Safe Travel Information",
        url="https://www.jnto.go.jp/safety-tips/eng/",
        url_ja="https://www.jnto.go.jp/safety-tips/eng/",
        languages=("en",),
        area="Nationwide",
    ),
    TransitLink(
        id="mlit-saigai",
        category="overall",
        name="MLIT Disaster Information",
        url="https://www.mlit.go.jp/saigai/",
        url_ja="https://www.mlit.go.jp/saigai/",
        languages=("ja",),
        area="Nationwide",
    ),
    # --- 鉄道 ---
    TransitLink(
        id="jr-east",
        category="rail",
        name="JR East",
        url="https://traininfo.jreast.co.jp/train_info/e/",
        url_ja="https://traininfo.jreast.co.jp/train_info/",
        languages=("en", "ja"),
        area="Tokyo, Tohoku, Niigata",
    ),
    TransitLink(
        id="jr-central",
        category="rail",
        name="JR Central (Tokaido Shinkansen)",
        url="https://traininfo.jr-central.co.jp/shinkansen/",
        url_ja="https://traininfo.jr-central.co.jp/shinkansen/",
        languages=("ja",),
        area="Tokyo - Nagoya - Osaka",
    ),
    TransitLink(
        id="jr-west",
        category="rail",
        name="JR West",
        url="https://trafficinfo.westjr.co.jp/",
        url_ja="https://trafficinfo.westjr.co.jp/",
        languages=("ja",),
        area="Osaka, Kyoto, Hiroshima",
    ),
    TransitLink(
        id="jr-hokkaido",
        category="rail",
        name="JR Hokkaido",
        url="https://www3.jrhokkaido.co.jp/webunkou/",
        url_ja="https://www3.jrhokkaido.co.jp/webunkou/",
        languages=("ja",),
        area="Hokkaido",
    ),
    TransitLink(
        id="jr-kyushu",
        category="rail",
        name="JR Kyushu",
        url="https://www.jrkyushu.co.jp/english/",
        url_ja="https://www.jrkyushu.co.jp/",
        languages=("en", "ja"),
        area="Kyushu",
    ),
    TransitLink(
        id="jr-shikoku",
        category="rail",
        name="JR Shikoku",
        url="https://www.jr-shikoku.co.jp/",
        url_ja="https://www.jr-shikoku.co.jp/",
        languages=("ja",),
        area="Shikoku",
    ),
    # --- 航空 ---
    TransitLink(
        id="narita",
        category="air",
        name="Narita International Airport",
        url="https://www.narita-airport.jp/en/flight/",
        url_ja="https://www.narita-airport.jp/ja/flight/",
        languages=("en", "ja", "zh", "zh-TW", "ko"),
        area="Tokyo (NRT)",
    ),
    TransitLink(
        id="haneda",
        category="air",
        name="Tokyo International Airport (Haneda)",
        url="https://tokyo-haneda.com/en/",
        url_ja="https://tokyo-haneda.com/",
        languages=("en", "ja", "zh", "zh-TW", "ko"),
        area="Tokyo (HND)",
    ),
    TransitLink(
        id="kansai",
        category="air",
        name="Kansai International Airport",
        url="https://www.kansai-airport.or.jp/en",
        url_ja="https://www.kansai-airport.or.jp/",
        languages=("en", "ja", "zh", "zh-TW", "ko"),
        area="Osaka (KIX)",
    ),
    # 中部国際空港（セントレア, NGO）は意図的に載せていない。
    # WAF が自動アクセスを 403 で弾くため、リンクが生きているかを
    # verify_transit_links.py でも WebFetch でも確認できなかった（2026-08-01 実測）。
    # 人間のブラウザでは開ける可能性が高いが、**検証できないリンクは載せない**。
    # 検証手段ができたら追加すること。
    TransitLink(
        id="new-chitose",
        category="air",
        name="New Chitose Airport",
        url="https://www.hokkaido-airports.com/en/new-chitose/",
        url_ja="https://www.hokkaido-airports.com/ja/new-chitose/",
        languages=("en", "ja", "zh", "zh-TW", "ko"),
        area="Sapporo (CTS)",
    ),
    # --- 道路 ---
    TransitLink(
        id="jartic",
        category="road",
        name="Japan Road Traffic Information Center (JARTIC)",
        url="https://www.jartic.or.jp/",
        url_ja="https://www.jartic.or.jp/",
        languages=("ja",),
        area="Nationwide",
    ),
)

#: 表示順。分類の並びもここで固定する
CATEGORY_ORDER: tuple[Category, ...] = ("overall", "rail", "air", "road")

DEFAULT_LANG = "en"


def _label(mapping: dict[str, str], lang: str) -> str:
    """未対応言語は日本語ではなく英語に落とす（読めない人に読めないものを返さない）。"""
    return mapping.get(lang) or mapping[DEFAULT_LANG]


def build_transit_links(lang: str) -> dict:
    """指定言語で分類ごとにまとめた交通リンク集を返す。

    Args:
        lang: 言語コード

    Returns:
        `{"title", "available_in_label", "groups": [...]}`。
        `groups` の各要素は `{"category", "label", "links"}` で、
        リンクが1本も無い分類は含めない。
    """
    # 未対応の言語コードはここで英語に寄せる。呼び出し側の検証に依存せず、
    # この関数単体で常に読める結果を返せるようにしておく。
    if lang not in ALLOWED_LANGUAGES:
        lang = DEFAULT_LANG

    groups: list[dict] = []
    for category in CATEGORY_ORDER:
        links = [link for link in TRANSIT_LINKS if link.category == category]
        if not links:
            continue
        groups.append(
            {
                "category": category,
                "label": _label(CATEGORY_LABELS[category], lang),
                "links": [
                    {
                        "id": link.id,
                        "name": link.name,
                        # 利用者の言語で読めるページがあるならそちらを開く
                        "url": link.url_ja if lang in ("ja", "easy_ja") else link.url,
                        "languages": list(link.languages),
                        # そのページが利用者の言語で読めるか。読めないなら
                        # クライアントが「英語のみ」等を控えめに示せる
                        "readable_in_user_language": lang in link.languages,
                        "area": link.area,
                    }
                    for link in links
                ],
            }
        )
    return {
        "title": _label(SECTION_TITLE, lang),
        "available_in_label": _label(AVAILABLE_IN_LABEL, lang),
        "groups": groups,
    }
