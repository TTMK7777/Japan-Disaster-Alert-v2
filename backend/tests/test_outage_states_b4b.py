"""上流の失敗・形の異常を「0 件」「最新」と見せないこと（B4b）。

- 警報 JSON が 200 でも areaTypes が null／非配列／全件読めない → その予報区は取得失敗
  （全区なら 503、一部ならヘッダで欠落を示す）。本当に「発表警報・注意報はなし」の応答は 0 件のまま
- SSE の heartbeat に地震・津波の直近の取得成否を載せる（接続が生きていることと、
  上流の情報が新しいことを分ける。フロントは成功した取得だけで最終取得時刻を進める）
- 全国の特別警報（/api/v1/warnings/special）も、取れなかった予報区をヘッダで示す。全区失敗は 503
"""
from urllib.parse import unquote

import httpx
import pytest

from app import main as main_module
from app.services.event_manager import EventManager
from app.services.warning_service import WarningService
from tests.test_outage_states import FAILURES, _Client, _warning_payload


@pytest.fixture(autouse=True)
def _no_limiter(monkeypatch):
    monkeypatch.setattr(main_module.limiter, "enabled", False)


# 実レスポンスの「発表警報・注意報はなし」の形（areaTypes は 2 階層、各地域の warnings に status だけ）
NO_WARNINGS_REAL_SHAPE = {
    "reportDatetime": "2026-10-22T10:00:00+09:00",
    "areaTypes": [
        {"areas": [{"code": "130011", "warnings": [{"status": "発表警報・注意報はなし"}]}]},
        {"areas": [{"code": "1310100", "warnings": [{"status": "発表警報・注意報はなし"}]}]},
    ],
}

MALFORMED = {
    "areaTypes_null": {"reportDatetime": "2026-10-22T10:00:00+09:00", "areaTypes": None},
    "areaTypes_missing": {"reportDatetime": "2026-10-22T10:00:00+09:00"},
    "areaTypes_dict": {"reportDatetime": "2026-10-22T10:00:00+09:00", "areaTypes": {"areas": []}},
    "body_list": [],
    "all_records_broken": {
        "reportDatetime": "2026-10-22T10:00:00+09:00",
        "areaTypes": [
            {"areas": ["broken", {"code": "130011", "warnings": None}]},
            "not-a-dict",
        ],
    },
    "warnings_without_status": {
        "reportDatetime": "2026-10-22T10:00:00+09:00",
        "areaTypes": [{"areas": [{"code": "130011", "warnings": [{"kind": "x"}]}]}],
    },
}


class TestWarningShape:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("kind", list(MALFORMED))
    async def test_形の異常は警報なしにせず503(self, client, monkeypatch, kind):
        stub = _Client(lambda url: MALFORMED[kind])
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=130000&lang=en")
        assert res.status_code == 503, f"{kind}: {res.status_code} {res.text[:80]}"

    @pytest.mark.asyncio
    async def test_一部の予報区だけ形が異常ならヘッダで欠落を示す(self, client, monkeypatch):
        def route(url):
            if "474000" in url:
                return MALFORMED["areaTypes_null"]
            return _warning_payload("471010")

        stub = _Client(route)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=471000&lang=en")
        assert res.status_code == 200
        assert len(res.json()) >= 1
        assert res.headers["x-failed-areas"].split(",") == ["474000"]

    @pytest.mark.asyncio
    async def test_実形の警報なしは200の0件(self, client, monkeypatch):
        stub = _Client(lambda url: NO_WARNINGS_REAL_SHAPE)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=130000&lang=en")
        assert res.status_code == 200
        assert res.json() == []
        assert "x-failed-areas" not in res.headers

    @pytest.mark.asyncio
    async def test_一部のレコードだけ壊れていても読めた分で判定する(self, client, monkeypatch):
        """全件ではなく一部だけの型崩れは従来どおり（そのレコードだけ捨てる）。"""
        payload = _warning_payload("130011")
        payload["areaTypes"][0]["areas"].insert(0, "broken")
        stub = _Client(lambda url: payload)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=130000&lang=en")
        assert res.status_code == 200
        assert len(res.json()) == 1

    @pytest.mark.asyncio
    async def test_継続中の警報は形の検査を通る(self, client, monkeypatch):
        payload = _warning_payload("130011")
        payload["areaTypes"][0]["areas"][0]["warnings"][0]["status"] = "継続"
        stub = _Client(lambda url: payload)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=130000&lang=en")
        assert res.status_code == 200
        assert len(res.json()) == 1


# --------------------------------------------------------------------------- 特別警報（全国）


def _special_payload(area_code: str) -> dict:
    return _warning_payload(area_code, warning_code="33")  # 大雨特別警報


class TestSpecialWarningsPartial:
    @pytest.mark.asyncio
    async def test_一部の予報区が失敗したらヘッダで示す(self, client, monkeypatch):
        def route(url):
            if "474000" in url:
                return FAILURES["timeout"]
            if "130000" in url:
                return _special_payload("130011")
            return NO_WARNINGS_REAL_SHAPE

        stub = _Client(route)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/warnings/special?lang=ja")
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.headers["x-failed-areas"].split(",") == ["474000"]
        assert [unquote(n) for n in res.headers["x-failed-area-names"].split(",")] == ["八重山地方"]

    @pytest.mark.asyncio
    async def test_全予報区が失敗したら503(self, client, monkeypatch):
        stub = _Client(lambda url: FAILURES["http_status"])
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/warnings/special?lang=ja")
        assert res.status_code == 503

    @pytest.mark.asyncio
    async def test_全予報区が取れて特別警報なしは200の0件(self, client, monkeypatch):
        stub = _Client(lambda url: NO_WARNINGS_REAL_SHAPE)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/warnings/special?lang=ja")
        assert res.status_code == 200
        assert res.json() == []
        assert "x-failed-areas" not in res.headers


# --------------------------------------------------------------------------- SSE heartbeat


class _Quake:
    def __init__(self, id_):
        self.id = id_

    def model_dump(self):
        return {"id": self.id}


class _P2P:
    def __init__(self):
        self.fail = False

    async def fetch_recent_earthquakes(self, limit=10):
        if self.fail:
            raise httpx.ReadTimeout("timed out")
        return [_Quake("q1")]


class _Tsunami:
    def __init__(self):
        self.fail = False

    async def fetch_active_warnings(self):
        if self.fail:
            raise httpx.ConnectError("down")
        return []


@pytest.fixture
def manager():
    m = EventManager()
    m._p2p_service = _P2P()
    m._tsunami_service = _Tsunami()
    return m


class TestHeartbeatCarriesSourceStatus:
    def test_まだ一度も取得していなければ成否は不明(self, manager):
        payload = manager._heartbeat_payload()
        assert payload["earthquake_ok"] is None
        assert payload["tsunami_ok"] is None
        assert "time" in payload and "clients" in payload, "既存のキーは残す"

    @pytest.mark.asyncio
    async def test_P2Pだけ落ちていればheartbeatで地震の失敗を伝える(self, manager):
        await manager._check_earthquakes()
        await manager._check_tsunamis()
        assert manager._heartbeat_payload()["earthquake_ok"] is True

        manager._p2p_service.fail = True
        await manager._check_earthquakes()
        await manager._check_tsunamis()
        payload = manager._heartbeat_payload()
        assert payload["earthquake_ok"] is False
        assert payload["tsunami_ok"] is True

    @pytest.mark.asyncio
    async def test_津波の失敗も伝え回復したら成功に戻る(self, manager):
        manager._tsunami_service.fail = True
        await manager._check_tsunamis()
        assert manager._heartbeat_payload()["tsunami_ok"] is False
        manager._tsunami_service.fail = False
        await manager._check_tsunamis()
        assert manager._heartbeat_payload()["tsunami_ok"] is True

    @pytest.mark.asyncio
    async def test_変化が無くても取得できたことは成功として残る(self, manager):
        """地震 ID が変わらない（配信しない）回でも、取得の成功は heartbeat に載る。"""
        await manager._check_earthquakes()
        manager._p2p_service.fail = True
        await manager._check_earthquakes()
        manager._p2p_service.fail = False
        await manager._check_earthquakes()  # 前回と同じ ID → 配信なし
        assert manager._heartbeat_payload()["earthquake_ok"] is True
