"""警報の地域名が利用者の言語で出ることの回帰テスト

## 背景（2026-08-01）

3つの欠陥が重なって、**どの言語で見ても地名が読めない**状態だった。

1. 警報 JSON に `name` が無いのに `area.get("name", "") or prefecture_name` と
   書いていたため、静的経路では常に都道府県名（日本語）が出ていた
2. AI 経路（`_parse_warnings_with_ai`）は `area.get("name", "")` でフォールバックも
   無く、地域名が**空文字**になっていた
3. `STATIC_LANGUAGES` が6言語しかなく、残る10言語（th/id/ms/tl/fr/de/it/es/ne/zh-TW）は
   2 の AI 経路に流れていた。そのため16言語化した `WARNING_NAMES` /
   `resolve_guidance` も**本番では使われていなかった**

3 が厄介で、既存テストは `_parse_warnings` を直接呼んでいたため、
本番が通らない経路を検証して緑になっていた。
"""
import pytest

from app.models import ALLOWED_LANGUAGES
from app.services.area_display import JAPANESE_LANGS
from app.services.warning_service import STATIC_LANGUAGES, WarningService

NON_JAPANESE_LANGS = sorted(ALLOWED_LANGUAGES - JAPANESE_LANGS)

#: 中国語の地名は漢字なので、字種では日本語と区別できない。この2言語は字種で判定しない。
CJK_LANGS = frozenset({"zh", "zh-TW"})


def _has_cjk(text: str) -> bool:
    return any(
        "぀" <= ch <= "ゟ" or "゠" <= ch <= "ヿ" or "一" <= ch <= "鿿" for ch in text
    )


def _payload(*area_codes: str, warning_code: str = "03") -> dict:
    """気象庁の実レスポンスと同じ形（`name` は存在しない）。"""
    return {
        "reportDatetime": "2026-08-01T12:00:00+09:00",
        "areaTypes": [
            {
                "areas": [
                    {"code": code, "warnings": [{"code": warning_code, "status": "発表"}]}
                    for code in area_codes
                ]
            }
        ],
    }


class TestAllLanguagesUseStaticPath:
    """16言語すべてが静的経路を通ること（AI に投げない）"""

    def test_受け付ける全言語が静的経路の対象(self):
        """**これが 3 の再現テスト。** 6言語に戻すと10言語ぶん落ちる。"""
        missing = sorted(ALLOWED_LANGUAGES - STATIC_LANGUAGES)
        assert not missing, f"AI 経路に流れてしまう言語が残っている: {missing}"

    @pytest.mark.parametrize("lang", sorted(ALLOWED_LANGUAGES))
    async def test_本番の入口から全言語がAIなしで地名まで出る(self, lang, monkeypatch):
        """**本番の入口 `get_warnings` を通す。**

        既存テストは `_parse_warnings` を直接呼んでいたため、`get_warnings` の
        言語分岐（`if lang in STATIC_LANGUAGES`）を通っておらず、10言語が AI 経路に
        流れて地名が空文字になっていたことを検出できなかった。
        分岐を含めて検証しないと同じ見逃しが再発する。
        """
        service = WarningService()

        class _FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return _payload("130010")

        class _FakeClient:
            async def get(self, url, timeout=None):
                return _FakeResponse()

        monkeypatch.setattr(WarningService, "_get_client", lambda self: _FakeClient())

        def _boom(*args, **kwargs):
            raise AssertionError("静的経路のはずが translator を呼んだ")

        monkeypatch.setattr(WarningService, "translator", property(_boom))

        alerts = await service.get_warnings("130000", lang)

        assert len(alerts) == 1, f"{lang} で警報が組み立てられなかった"
        area = alerts[0].area or ""
        assert area, f"{lang} で地名が空（AI 経路に落ちている）"
        if lang not in JAPANESE_LANGS:
            assert area not in ("東京都", "東京地方"), f"{lang} で地名が日本語のまま: {area}"

    @pytest.mark.parametrize("lang", sorted(ALLOWED_LANGUAGES))
    async def test_AIなしで全言語の警報が組み立てられる(self, lang, monkeypatch):
        """translator を一切使わずに 16 言語ぶんの警報が出ること。

        停電・低回線・APIキー未設定でも同じ結果が出る必要がある（docs の R2）。
        """
        service = WarningService()

        def _boom(*args, **kwargs):
            raise AssertionError("静的経路のはずが translator を呼んだ")

        monkeypatch.setattr(WarningService, "translator", property(_boom))

        alerts = service._parse_warnings(_payload("130010"), "130000", lang)
        assert len(alerts) == 1


class TestAreaNameIsLocalized:
    @pytest.mark.parametrize("lang", NON_JAPANESE_LANGS)
    def test_地名が日本語のまま出ない(self, lang):
        """**これが 1 の再現テスト。** 修正前は全言語で「東京都」が出ていた。"""
        service = WarningService()
        alerts = service._parse_warnings(_payload("130010"), "130000", lang)

        area = alerts[0].area or ""
        assert area, f"{lang} で地名が空"
        assert area not in ("東京都", "東京地方"), f"{lang} で地名が日本語のまま: {area}"

    @pytest.mark.parametrize(
        "lang", [l for l in NON_JAPANESE_LANGS if l not in CJK_LANGS]
    )
    def test_漢字を使わない言語の地名にCJKが混ざらない(self, lang):
        service = WarningService()
        alerts = service._parse_warnings(_payload("130010"), "130000", lang)
        assert not _has_cjk(alerts[0].area or "")

    @pytest.mark.parametrize("lang", NON_JAPANESE_LANGS)
    def test_説明文の中の地名も日本語のまま出ない(self, lang):
        service = WarningService()
        alerts = service._parse_warnings(_payload("130010"), "130000", lang)

        description = alerts[0].description_translated or ""
        assert "東京都" not in description
        assert "東京地方" not in description

    def test_日本語では従来どおり日本語の地名(self):
        service = WarningService()
        alerts = service._parse_warnings(_payload("130010"), "130000", "ja")
        assert "東京地方" in (alerts[0].description or "")

    def test_地名が都道府県ではなく細分区域になる(self):
        """気象庁が出しているとおりの粒度で「どこ」を伝える。"""
        service = WarningService()
        alerts = service._parse_warnings(_payload("471010"), "471000", "en")
        assert alerts[0].area == "Central and Southern Main Island"

    def test_複数地域がまとめて表示される(self):
        service = WarningService()
        alerts = service._parse_warnings(_payload("130010", "130020"), "130000", "en")

        area = alerts[0].area or ""
        assert "Tokyo Region" in area
        assert "Northern Izu Islands" in area


class TestContinuingWarningsAreShown:
    """継続中の警報が消えないこと

    気象庁は最初に出したときだけ `status` を "発表" にし、その後の定時更新では
    "継続" に変える。"発表" だけを通していたため、**発表直後の一瞬しか警報が
    表示されず、継続中の警報はすべて消えていた**。

    実測（2026-08-01 沖縄 471000）では 継続 62 件・解除 29 件・発表 0 件で、
    有効な注意報がありながらアプリの表示はゼロだった。
    """

    @staticmethod
    def _payload_with_status(status: str) -> dict:
        return {
            "reportDatetime": "2026-08-01T12:00:00+09:00",
            "areaTypes": [
                {"areas": [{"code": "130010", "warnings": [{"code": "03", "status": status}]}]}
            ],
        }

    def test_継続中の警報が表示される(self):
        """**これが再現テスト。** "発表" だけに戻すと落ちる。"""
        service = WarningService()
        alerts = service._parse_warnings(self._payload_with_status("継続"), "130000", "en")
        assert len(alerts) == 1, "継続中の警報が消えた"

    def test_発表直後の警報も表示される(self):
        service = WarningService()
        alerts = service._parse_warnings(self._payload_with_status("発表"), "130000", "en")
        assert len(alerts) == 1

    @pytest.mark.parametrize("status", ["解除", "発表警報・注意報はなし", ""])
    def test_有効でないステータスは表示しない(self, status):
        service = WarningService()
        alerts = service._parse_warnings(self._payload_with_status(status), "130000", "en")
        assert alerts == [], f"{status} が表示された"

    def test_継続と解除が混在しても継続だけ出る(self):
        """実データはこの形（沖縄は継続62件・解除29件）。"""
        service = WarningService()
        payload = {
            "reportDatetime": "2026-08-01T12:00:00+09:00",
            "areaTypes": [
                {
                    "areas": [
                        {
                            "code": "130010",
                            "warnings": [
                                {"code": "14", "status": "継続"},
                                {"code": "20", "status": "解除"},
                            ],
                        }
                    ]
                }
            ],
        }

        alerts = service._parse_warnings(payload, "130000", "ja")
        assert len(alerts) == 1
        assert alerts[0].title == "雷注意報"


class TestWarningIsNeverLost:
    """地名が引けなくても警報そのものは落とさない"""

    def test_未知の地域コードでも警報は出る(self):
        """マスタ更新前の新コードが来ても、警報を握りつぶさない。"""
        service = WarningService()
        alerts = service._parse_warnings(_payload("999999"), "130000", "en")

        assert len(alerts) == 1, "地名が引けないだけで警報が消えた"
        assert alerts[0].area  # 都道府県名にフォールバック

    def test_未知の地域コードでは都道府県まで粒度を落とす(self):
        service = WarningService()
        alerts = service._parse_warnings(_payload("999999"), "130000", "en")
        assert alerts[0].area == "Tokyo"

    def test_市町村レベルの地域は表示に使わない(self):
        """areaTypes[1] は7桁の市町村コード。30件並べても読めない。"""
        service = WarningService()
        payload = _payload("471010")
        payload["areaTypes"].append(
            {
                "areas": [
                    {"code": "4720100", "warnings": [{"code": "03", "status": "発表"}]},
                    {"code": "4720500", "warnings": [{"code": "03", "status": "発表"}]},
                ]
            }
        )

        alerts = service._parse_warnings(payload, "471000", "en")
        assert len(alerts) == 1
        assert alerts[0].area == "Central and Southern Main Island"

    def test_市町村レベルにしか無い警報も落とさない(self):
        """細分区域が1つも引けない警報は都道府県名で出す。"""
        service = WarningService()
        payload = {
            "reportDatetime": "2026-08-01T12:00:00+09:00",
            "areaTypes": [
                {
                    "areas": [
                        {"code": "4720100", "warnings": [{"code": "03", "status": "発表"}]}
                    ]
                }
            ],
        }

        alerts = service._parse_warnings(payload, "471000", "en")
        assert len(alerts) == 1, "市町村にしか無い警報が消えた"
        assert alerts[0].area == "Okinawa Main Island"
