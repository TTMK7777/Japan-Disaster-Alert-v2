"""継続中の警報を「たった今発表された」ように見せない。

実データで観測した事象を固定する（2026-08-23 実測）:
気象庁の東京都 130000.json は、実行日が 8/23 でも
`reportDatetime: "2026-05-28T10:16:00+09:00"` を返していた。
中身は伊豆諸島の雷・強風・波浪注意報で、すべて status="継続"。

気象庁は**変化がない限り reportDatetime を更新しない**ため、
3か月前に出た注意報が当時の日付を持ったまま届く。データは正しい。
しかし説明文が常に「〜が発表されています」という現在形だったため、
利用者には**3か月前の注意報がたった今出たように見えていた**。
"""
import pytest

from app.services.warning_service import WarningService


def _jma_payload(*, status: str, code: str = "14", area_id: str = "130020") -> dict:
    """気象庁 /bosai/warning/data/warning/{area}.json の最小形。

    地名は入っておらず code だけが来る（実レスポンスで確認済みの形）。
    """
    return {
        "reportDatetime": "2026-05-28T10:16:00+09:00",
        "areaTypes": [
            {"areas": [{"code": area_id, "warnings": [{"code": code, "status": status}]}]}
        ],
    }


@pytest.fixture
def service() -> WarningService:
    return WarningService()


def _parse(service: WarningService, payload: dict, lang: str = "ja"):
    return service._parse_warnings(payload, "130000", lang)


class TestContinuingWording:
    def test_継続中は継続の文言になる(self, service):
        alerts = _parse(service, _jma_payload(status="継続"))
        assert alerts, "警報が1件も出ていない"
        assert "継続しています" in alerts[0].description
        assert "発表されています" not in alerts[0].description, (
            "3か月前から続く注意報が「たった今発表された」ように見える"
        )

    def test_新規発表は従来どおりの文言(self, service):
        alerts = _parse(service, _jma_payload(status="発表"))
        assert alerts
        assert "発表されています" in alerts[0].description
        assert "継続しています" not in alerts[0].description

    def test_継続フラグがモデルに載る(self, service):
        assert _parse(service, _jma_payload(status="継続"))[0].is_continuing is True
        assert _parse(service, _jma_payload(status="発表"))[0].is_continuing is False

    def test_一地域でも発表があれば発表として扱う(self, service):
        """同じ警報コードでも地域ごとに status は異なる。

        新規発表を「継続中」に格下げすると緊急度を弱く見せることになる。
        安全側＝発表に倒す。
        """
        payload = {
            "reportDatetime": "2026-05-28T10:16:00+09:00",
            "areaTypes": [
                {"areas": [
                    {"code": "130020", "warnings": [{"code": "14", "status": "継続"}]},
                    {"code": "130030", "warnings": [{"code": "14", "status": "発表"}]},
                ]}
            ],
        }
        alerts = _parse(service, payload)
        assert alerts
        assert alerts[0].is_continuing is False
        assert "発表されています" in alerts[0].description

    def test_全地域が継続なら継続として扱う(self, service):
        payload = {
            "reportDatetime": "2026-05-28T10:16:00+09:00",
            "areaTypes": [
                {"areas": [
                    {"code": "130020", "warnings": [{"code": "14", "status": "継続"}]},
                    {"code": "130030", "warnings": [{"code": "14", "status": "継続"}]},
                ]}
            ],
        }
        alerts = _parse(service, payload)
        assert alerts
        assert alerts[0].is_continuing is True

    @pytest.mark.parametrize("lang", ["en", "ko", "zh", "th", "de", "fr", "easy_ja"])
    def test_継続の文言が各言語で発表と異なる(self, service, lang):
        """翻訳側だけ「発表」のままだと、日本語話者以外には直っていない。"""
        issued = _parse(service, _jma_payload(status="発表"), lang)[0]
        continuing = _parse(service, _jma_payload(status="継続"), lang)[0]
        assert issued.description_translated
        assert continuing.description_translated
        assert issued.description_translated != continuing.description_translated, (
            f"{lang}: 発表と継続で同じ文言になっている"
        )
