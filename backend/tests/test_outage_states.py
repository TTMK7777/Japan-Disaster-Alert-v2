"""上流（気象庁・P2P）が落ちたとき、通常 API が「0 件」を返さないこと（B4a）。

200 の [] を返すと、フロントは「警報なし」「地震情報はありません」「噴火警報なし」と描画し、
訪日客は「安全だ」と読む。取得できなかったときは 503、一部の予報区だけ取れなかったときは
成功分の配列に加えてヘッダで欠けた予報区を示す（配列の形は変えない）。
"""
import json
from urllib.parse import unquote

import httpx
import pytest

from app import main as main_module
from app.exceptions import UpstreamUnavailableError
from app.services.event_manager import EventManager
from app.services.p2p_service import P2PQuakeService
from app.services.volcano_service import VolcanoService
from app.services.warning_service import WarningService

# 失敗の 3 種類: HTTP ステータス・通信（タイムアウト）・壊れた本文（ValueError）
_REQUEST = httpx.Request("GET", "https://example.invalid/")
FAILURES = {
    "http_status": httpx.HTTPStatusError(
        "503", request=_REQUEST, response=httpx.Response(503, request=_REQUEST)
    ),
    "timeout": httpx.ReadTimeout("timed out", request=_REQUEST),
    "broken_json": json.JSONDecodeError("Expecting value", "<html>", 0),
}


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        if isinstance(self._payload, httpx.HTTPStatusError):
            raise self._payload

    def json(self):
        if isinstance(self._payload, ValueError):
            raise self._payload
        return self._payload


class _Client:
    """URL に含まれる文字列で応答を選ぶ。通信例外は get で投げる。"""

    def __init__(self, route):
        self.route = route

    async def get(self, url, timeout=None, params=None):
        payload = self.route(url)
        if isinstance(payload, httpx.TransportError):
            raise payload
        return _Resp(payload)


def _warning_payload(area_code: str, warning_code: str = "14") -> dict:
    return {
        "reportDatetime": "2026-10-22T10:00:00+09:00",
        "areaTypes": [
            {"areas": [{"code": area_code, "warnings": [{"code": warning_code, "status": "発表"}]}]}
        ],
    }


@pytest.fixture(autouse=True)
def _no_limiter(monkeypatch):
    monkeypatch.setattr(main_module.limiter, "enabled", False)


# --------------------------------------------------------------------------- 警報


class TestWarningsAllFailed:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("kind", list(FAILURES))
    async def test_全予報区が失敗したら503で空配列にしない(self, client, monkeypatch, kind):
        failure = FAILURES[kind]
        stub = _Client(lambda url: failure)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=130000&lang=en")
        assert res.status_code == 503, f"{kind}: 取得失敗が {res.status_code} {res.text[:80]}"

    @pytest.mark.asyncio
    async def test_北海道8予報区がすべて失敗しても503(self, client, monkeypatch):
        stub = _Client(lambda url: FAILURES["timeout"])
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=016000&lang=ja")
        assert res.status_code == 503

    @pytest.mark.asyncio
    async def test_確認できた0件は200の空配列で欠落ヘッダなし(self, client, monkeypatch):
        empty = {"reportDatetime": "2026-10-22T10:00:00+09:00", "areaTypes": []}
        stub = _Client(lambda url: empty)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=130000&lang=en")
        assert res.status_code == 200
        assert res.json() == []
        assert "x-failed-areas" not in res.headers


class TestWarningsPartiallyFailed:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("kind", list(FAILURES))
    async def test_一部の予報区の失敗をヘッダで示し成功分は返す(self, client, monkeypatch, kind):
        """沖縄（4 予報区）のうち宮古島・八重山が落ちた。本島の警報は出し、欠けた 2 区を示す。"""
        failure = FAILURES[kind]

        def route(url):
            if "473000" in url or "474000" in url:
                return failure
            return _warning_payload("471010")

        stub = _Client(route)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=471000&lang=en")
        assert res.status_code == 200
        body = res.json()
        assert isinstance(body, list), "配列の形を変えない（既存の利用者・SW キャッシュとの互換）"
        assert len(body) >= 1, "成功した予報区の警報まで消えている"
        assert res.headers["x-failed-areas"].split(",") == ["473000", "474000"]
        names = [unquote(n) for n in res.headers["x-failed-area-names"].split(",")]
        assert names == ["Miyakojima Region", "Yaeyama"]

    @pytest.mark.asyncio
    async def test_欠けた地域名は日本語でも読める(self, client, monkeypatch):
        def route(url):
            return FAILURES["timeout"] if "474000" in url else _warning_payload("471010")

        stub = _Client(route)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=471000&lang=ja")
        names = [unquote(n) for n in res.headers["x-failed-area-names"].split(",")]
        assert names == ["八重山地方"]

    @pytest.mark.asyncio
    async def test_成功分が0件でも一部失敗は200とヘッダ(self, client, monkeypatch):
        """取れた予報区に警報が無くても、欠けた予報区がある限り「警報なし」とは言えない。"""
        empty = {"reportDatetime": "2026-10-22T10:00:00+09:00", "areaTypes": []}

        def route(url):
            return FAILURES["http_status"] if "474000" in url else empty

        stub = _Client(route)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        res = await client.get("/api/v1/alerts?area_code=471000&lang=en")
        assert res.status_code == 200
        assert res.json() == []
        assert res.headers["x-failed-areas"] == "474000"

    @pytest.mark.asyncio
    async def test_ブラウザから欠落ヘッダが読める(self, client, monkeypatch):
        """フロントは別オリジン。CORS で公開しないと fetch から読めない。"""
        def route(url):
            return FAILURES["timeout"] if "474000" in url else _warning_payload("471010")

        stub = _Client(route)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        origin = main_module.CORS_ALLOWED_ORIGINS[0]
        res = await client.get(
            "/api/v1/alerts?area_code=471000&lang=en", headers={"Origin": origin}
        )
        exposed = res.headers.get("access-control-expose-headers", "").lower()
        assert "x-failed-areas" in exposed
        assert "x-failed-area-names" in exposed


class TestWarningServiceContract:
    @pytest.mark.asyncio
    async def test_fetch_warningsは失敗した予報区を返す(self, monkeypatch):
        service = WarningService()

        def route(url):
            return FAILURES["broken_json"] if "012000" in url else _warning_payload("011000")

        stub = _Client(route)
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        result = await service.fetch_warnings("016000", "ja")
        assert result.failed_offices == ["012000"]
        assert len(result.alerts) >= 1

    @pytest.mark.asyncio
    async def test_fetch_warningsは全失敗で例外(self, monkeypatch):
        service = WarningService()
        stub = _Client(lambda url: FAILURES["timeout"])
        monkeypatch.setattr(WarningService, "_get_client", lambda self: stub)
        with pytest.raises(UpstreamUnavailableError):
            await service.fetch_warnings("130000", "ja")


# --------------------------------------------------------------------------- 地震


class TestEarthquakesUnavailable:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("kind", list(FAILURES))
    async def test_P2Pの失敗は503で空配列にしない(self, client, monkeypatch, kind):
        failure = FAILURES[kind]
        stub = _Client(lambda url: failure)
        monkeypatch.setattr(main_module.p2p_service, "_get_client", lambda: stub)
        res = await client.get("/api/v1/earthquakes?lang=en")
        assert res.status_code == 503, f"{kind}: {res.status_code}"

    @pytest.mark.asyncio
    async def test_確認できた0件は200の空配列(self, client, monkeypatch):
        stub = _Client(lambda url: [])
        monkeypatch.setattr(main_module.p2p_service, "_get_client", lambda: stub)
        res = await client.get("/api/v1/earthquakes?lang=en")
        assert res.status_code == 200
        assert res.json() == []


class _FakeP2P:
    def __init__(self):
        self.result = []

    async def fetch_recent_earthquakes(self, limit: int = 10):
        if isinstance(self.result, Exception):
            raise self.result
        return self.result

    async def get_recent_earthquakes(self, limit: int = 10):
        # 旧経路（失敗を [] に潰す）。SSE がこちらを使うと、失敗が「0 件」として配信される
        try:
            return await self.fetch_recent_earthquakes(limit)
        except (httpx.HTTPError, ValueError):
            return []


def _earthquake(eq_id: str):
    return P2PQuakeService()._parse_earthquake(
        {
            "id": eq_id,
            "code": 551,
            "earthquake": {
                "time": "2026/10/22 10:00:00",
                "hypocenter": {"name": "石川県能登地方", "magnitude": 4.5, "depth": 10,
                               "latitude": 37.5, "longitude": 137.2},
                "maxScale": 30,
                "domesticTsunami": "None",
            },
        }
    )


class TestSseEarthquakesOnFailure:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("kind", list(FAILURES))
    async def test_取得失敗で空配列を配信しない(self, monkeypatch, kind):
        manager = EventManager()
        fake = _FakeP2P()
        manager._p2p_service = fake
        queue = await manager.connect()

        eq = _earthquake("eq-1")
        assert eq is not None
        fake.result = [eq]
        await manager._check_earthquakes()
        first = json.loads(queue.get_nowait().split("data: ", 1)[1])
        assert [e["id"] for e in first["earthquakes"]] == ["eq-1"]

        fake.result = FAILURES[kind]
        await manager._check_earthquakes()
        assert queue.empty(), "取得失敗が「地震 0 件」として配信された（一覧が消える）"

        # 復旧して同じ一覧なら、配信し直さなくても画面は正しいまま
        fake.result = [eq]
        await manager._check_earthquakes()
        assert queue.empty()

    @pytest.mark.asyncio
    async def test_確認できた0件は配信する(self, monkeypatch):
        manager = EventManager()
        fake = _FakeP2P()
        manager._p2p_service = fake
        queue = await manager.connect()
        fake.result = [_earthquake("eq-1")]
        await manager._check_earthquakes()
        queue.get_nowait()
        fake.result = []
        await manager._check_earthquakes()
        payload = json.loads(queue.get_nowait().split("data: ", 1)[1])
        assert payload["earthquakes"] == []


# --------------------------------------------------------------------------- 噴火警報


class TestVolcanoWarningsUnavailable:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("kind", list(FAILURES))
    async def test_キャッシュが無い状態の失敗は503(self, client, monkeypatch, kind):
        service = VolcanoService()
        failure = FAILURES[kind]
        stub = _Client(lambda url: failure)
        monkeypatch.setattr(service, "_get_client", lambda: stub)
        monkeypatch.setattr(main_module, "volcano_service", service)
        res = await client.get("/api/v1/volcanoes/warnings?lang=en")
        assert res.status_code == 503, f"{kind}: {res.status_code}"

    @pytest.mark.asyncio
    async def test_配列でない本文は503(self, client, monkeypatch):
        service = VolcanoService()
        stub = _Client(lambda url: {"unexpected": "shape"} if "warning" in url else [])
        monkeypatch.setattr(service, "_get_client", lambda: stub)
        monkeypatch.setattr(main_module, "volcano_service", service)
        res = await client.get("/api/v1/volcanoes/warnings?lang=en")
        assert res.status_code == 503

    @pytest.mark.asyncio
    async def test_確認できた0件は200の空配列(self, client, monkeypatch):
        service = VolcanoService()
        stub = _Client(lambda url: [])
        monkeypatch.setattr(service, "_get_client", lambda: stub)
        monkeypatch.setattr(main_module, "volcano_service", service)
        res = await client.get("/api/v1/volcanoes/warnings?lang=en")
        assert res.status_code == 200
        assert res.json() == []
