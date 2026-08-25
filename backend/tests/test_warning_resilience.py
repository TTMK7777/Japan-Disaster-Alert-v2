"""外部 API の部分的な故障への耐性。

レビューで確定した 2 つの欠陥を固定する:

1. `_fetch_warning_payload` は `httpx.HTTPError` しか握っておらず、
   200 で壊れた本文（切断・プロキシ改変等）が返ると `json.JSONDecodeError`
   （`ValueError` のサブクラス、`httpx.HTTPError` の子ではない）が
   `asyncio.gather`（`return_exceptions` なし）を突き抜け、
   **他の予報区が正常でも都道府県全体・全国スキャン全体が 500** になっていた。
   これは同メソッドの docstring「1 予報区が落ちても他の予報区の警報は出す」と
   正面から矛盾する。

2. `_parse_warnings` に例外処理が無く、レコード 1 件の型崩れ
   （`warnings` が null、要素が dict でない等）で**その地域の警報が全部 500**
   になっていた。
"""
import json

import httpx
import pytest

from app.services.warning_service import WarningService


def _payload(area_code: str = "130010") -> dict:
    return {
        "reportDatetime": "2026-08-25T10:00:00+09:00",
        "areaTypes": [
            {
                "areas": [
                    {"code": area_code, "warnings": [{"code": "14", "status": "発表"}]}
                ]
            }
        ],
    }


class _Response:
    """正常な JSON を返すレスポンス。"""

    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _BrokenJsonResponse:
    """200 だが本文が壊れている（実際の httpx と同じ例外を出す）。"""

    def raise_for_status(self):
        return None

    def json(self):
        raise json.JSONDecodeError("Expecting value", "<html>error page</html>", 0)


@pytest.fixture
def service() -> WarningService:
    return WarningService()


class TestBrokenJsonDoesNotKillTheWhole:
    @pytest.mark.asyncio
    async def test_1予報区の壊れたJSONで都道府県全体が死なない(self, service, monkeypatch):
        """北海道（8 予報区）の 1 つが壊れても、残り 7 予報区の警報は出ること。"""

        class _Client:
            async def get(self, url, timeout=None):
                # 上川・留萌（012000）だけ壊れた本文を返す
                if "012000" in url:
                    return _BrokenJsonResponse()
                return _Response(_payload("011000"))

        monkeypatch.setattr(WarningService, "_get_client", lambda self: _Client())

        # 例外にならず、正常な予報区ぶんの警報が返ること
        alerts = await service.get_warnings("016000", "ja")  # 北海道
        assert isinstance(alerts, list)
        assert len(alerts) >= 1, "正常な予報区の警報まで消えている"

    @pytest.mark.asyncio
    async def test_全国スキャンも1予報区の故障で死なない(self, service, monkeypatch):
        class _Client:
            async def get(self, url, timeout=None):
                if "130000" in url:
                    return _BrokenJsonResponse()
                return _Response(_payload())

        monkeypatch.setattr(WarningService, "_get_client", lambda self: _Client())
        alerts = await service.get_all_prefectures_warnings()
        assert isinstance(alerts, list)

    @pytest.mark.asyncio
    async def test_壊れたJSONはNoneとして扱われる(self, service, monkeypatch):
        class _Client:
            async def get(self, url, timeout=None):
                return _BrokenJsonResponse()

        monkeypatch.setattr(WarningService, "_get_client", lambda self: _Client())
        assert await service._fetch_warning_payload("130000") is None


class TestMalformedRecordIsolation:
    """1 レコードの型崩れは、そのレコードだけを捨てて他の警報は出す。"""

    def test_warningsがnullの地域があっても他の警報は出る(self, service):
        data = _payload()
        data["areaTypes"][0]["areas"].insert(
            0, {"code": "011000", "warnings": None}  # JSON の null
        )
        alerts = service._parse_warnings(data, "130000", "ja")
        assert len(alerts) == 1, "null レコードに巻き込まれて正常な警報が消えた"

    def test_areaが文字列でも他の警報は出る(self, service):
        data = _payload()
        data["areaTypes"][0]["areas"].insert(0, "broken-record")
        alerts = service._parse_warnings(data, "130000", "ja")
        assert len(alerts) == 1

    def test_areaTypesがnullなら空リスト(self, service):
        alerts = service._parse_warnings(
            {"reportDatetime": "", "areaTypes": None}, "130000", "ja"
        )
        assert alerts == []

    def test_area_typeが文字列でも落ちない(self, service):
        data = _payload()
        data["areaTypes"].insert(0, "not-a-dict")
        alerts = service._parse_warnings(data, "130000", "ja")
        assert len(alerts) == 1

    def test_全レコードが正常なら従来どおり(self, service):
        alerts = service._parse_warnings(_payload(), "130000", "ja")
        assert len(alerts) == 1
        assert alerts[0].severity in ("low", "medium", "high", "extreme")
