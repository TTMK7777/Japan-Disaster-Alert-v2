"""交通リンク集の回帰テスト

## 背景

訪日客の災害時ニーズ調査で「日程が崩壊した」37.3%（全体4位）・「交通と空港の情報」22.2% と
交通関連が上位に集中しているのに、アプリには交通のデータ源が1つも無かった
（`docs/dev/requirements-gap-2026.md` の R4）。運行情報そのものの配信には各社 API の
ライセンス調査が要るため、まず公式リンク集で空白を埋める。

**URL が生きているかはここでは検証しない。** 外部サイトに依存するテストは
他人の都合で落ち、やがて無視されるようになる。生死は
`scripts/verify_transit_links.py` で必要なときに実測する。
ここで固定するのは、リンク集の**構造とデータの整合性**である。
"""
import re

import pytest

from app.models import ALLOWED_LANGUAGES
from app.services.transit_links import (
    AVAILABLE_IN_LABEL,
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    TRANSIT_LINKS,
    build_transit_links,
)


class TestLinkData:
    def test_リンクが登録されている(self):
        assert len(TRANSIT_LINKS) >= 10

    def test_idが重複していない(self):
        ids = [link.id for link in TRANSIT_LINKS]
        assert len(ids) == len(set(ids))

    @pytest.mark.parametrize("link", TRANSIT_LINKS, ids=lambda l: l.id)
    def test_URLがhttpsで始まる(self, link):
        """災害時に平文で通信させない。"""
        assert link.url.startswith("https://"), link.url
        assert link.url_ja.startswith("https://"), link.url_ja

    @pytest.mark.parametrize("link", TRANSIT_LINKS, ids=lambda l: l.id)
    def test_対応言語が空でない(self, link):
        """何語で読めるか分からないリンクは利用者を無駄に消耗させる。"""
        assert link.languages

    @pytest.mark.parametrize("link", TRANSIT_LINKS, ids=lambda l: l.id)
    def test_対応言語が実在する言語コード(self, link):
        unknown = set(link.languages) - ALLOWED_LANGUAGES
        assert not unknown, f"{link.id} に未知の言語コード: {unknown}"

    @pytest.mark.parametrize("link", TRANSIT_LINKS, ids=lambda l: l.id)
    def test_分類が定義済み(self, link):
        assert link.category in CATEGORY_ORDER

    @pytest.mark.parametrize("link", TRANSIT_LINKS, ids=lambda l: l.id)
    def test_名称が英字を含む(self, link):
        """事業者名は現地の案内表示と照合できる正式表記にする（訳さない）。"""
        assert re.search(r"[A-Za-z]", link.name), link.name

    def test_主要な分類にリンクがある(self):
        categories = {link.category for link in TRANSIT_LINKS}
        assert {"overall", "rail", "air"} <= categories

    def test_主要空港が入っている(self):
        ids = {link.id for link in TRANSIT_LINKS}
        assert {"narita", "haneda", "kansai"} <= ids


class TestLabelsAreComplete:
    """見出しが16言語そろっていること（英語に落ちる言語を作らない）"""

    @pytest.mark.parametrize("category", CATEGORY_ORDER)
    @pytest.mark.parametrize("lang", sorted(ALLOWED_LANGUAGES))
    def test_分類の見出しが全言語にある(self, category, lang):
        assert CATEGORY_LABELS[category].get(lang), f"{category}/{lang} が無い"

    @pytest.mark.parametrize("lang", sorted(ALLOWED_LANGUAGES))
    def test_対応言語ラベルが全言語にある(self, lang):
        assert AVAILABLE_IN_LABEL.get(lang)

    @pytest.mark.parametrize("category", CATEGORY_ORDER)
    def test_分類の見出しが言語ごとに異なる(self, category):
        """全言語に同じ文字列を入れて「対応済み」に見せかけていないこと。"""
        labels = CATEGORY_LABELS[category]
        assert len(set(labels.values())) > 8, f"{category} の見出しがほぼ同一"


class TestBuildTransitLinks:
    @pytest.mark.parametrize("lang", sorted(ALLOWED_LANGUAGES))
    def test_全言語で組み立てられる(self, lang):
        result = build_transit_links(lang)
        assert result["title"]
        assert result["available_in_label"]
        for group in result["groups"]:
            assert group["label"]
            assert group["links"]

    @pytest.mark.parametrize("lang", sorted(ALLOWED_LANGUAGES - {"ja", "easy_ja"}))
    def test_日本語以外では日本語の見出しが出ない(self, lang):
        labels = [g["label"] for g in build_transit_links(lang)["groups"]]
        labels.append(build_transit_links(lang)["title"])
        assert "鉄道" not in labels
        assert "空港・航空" not in labels

    def test_分類の順序が固定されている(self):
        categories = [g["category"] for g in build_transit_links("en")["groups"]]
        assert categories == list(CATEGORY_ORDER)

    def test_日本語では日本語ページを開く(self):
        links = {l["id"]: l for g in build_transit_links("ja")["groups"] for l in g["links"]}
        assert links["jr-east"]["url"] == "https://traininfo.jreast.co.jp/train_info/"

    def test_日本語以外では英語ページを開く(self):
        links = {l["id"]: l for g in build_transit_links("fr")["groups"] for l in g["links"]}
        assert links["jr-east"]["url"] == "https://traininfo.jreast.co.jp/train_info/e/"

    def test_やさしい日本語でも日本語ページを開く(self):
        links = {l["id"]: l for g in build_transit_links("easy_ja")["groups"] for l in g["links"]}
        assert links["jr-east"]["url"] == "https://traininfo.jreast.co.jp/train_info/"

    def test_利用者の言語で読めるかを示す(self):
        """タイ語話者に「日本語のみ」のページだと分かるようにする。"""
        links = {l["id"]: l for g in build_transit_links("th")["groups"] for l in g["links"]}
        assert links["jr-east"]["readable_in_user_language"] is False
        assert links["nhk-world"]["readable_in_user_language"] is True

    def test_未対応の言語コードでも英語で組み立てる(self):
        assert build_transit_links("xx") == build_transit_links("en")


class TestEndpoint:
    async def test_エンドポイントが返る(self, client):
        response = await client.get("/api/v1/transit-links?lang=en")
        assert response.status_code == 200
        assert response.json()

    async def test_言語で見出しが変わる(self, client):
        ko = await client.get("/api/v1/transit-links?lang=ko")
        en = await client.get("/api/v1/transit-links?lang=en")
        assert ko.json()["title"] != en.json()["title"]

    async def test_未知の言語でも落ちない(self, client):
        response = await client.get("/api/v1/transit-links?lang=xx")
        assert response.status_code == 200
