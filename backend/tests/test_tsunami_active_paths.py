"""既存の津波の経路（/api/v1/tsunami/active・/api/v1/tsunami・SSE）が実データの形で動くこと。

2026-10-22: 実 list.json の kind 要素は ``{"code", "kind"}`` で ``name`` キーが無い。
旧判定は ``kind.get("name")`` を見ていたため、**津波警報が出ても発表中は常に 0 件**だった。
（合成フィクスチャが ``name`` を持っていたので緑だった。気象庁 API の落とし穴 6 件目）

このファイルのフィクスチャは実レスポンスの形を正とする。``name`` を足して緑にしないこと。
"""
import asyncio
import json

import httpx
import pytest

from app import main as main_module
from app.services.event_manager import EventManager
from app.services.tsunami_service import TsunamiService

from test_tsunami_active_detection import REAL_FORECAST_REPORT, _report

ADVISORY = _report("20261022010500", "20261022010000", [("210", "津波注意報"), ("100", "津波予報（若干の海面変動）")])
WARNING = _report("20261022010500", "20261022010000", [("210", "津波警報")])
LIFTED = _report("20261022030000", "20261022010000", [("210", "津波注意報解除")])
# 旧テストが想定していた（実在しない）形: 種別が name キーに入っている
NAME_KEY_SHAPE = dict(ADVISORY, kind=[{"code": "210", "name": "津波注意報"}])


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        if isinstance(self._payload, httpx.HTTPError):
            raise self._payload

    def json(self):
        if isinstance(self._payload, ValueError):
            raise self._payload
        return self._payload


class _Client:
    def __init__(self, payload):
        self.payload = payload

    async def get(self, url, timeout=None):
        assert url.endswith("/tsunami/data/list.json"), url
        return _Resp(self.payload)


def _service(monkeypatch, payload) -> TsunamiService:
    service = TsunamiService()
    client = _Client(payload)
    monkeypatch.setattr(service, "_get_client", lambda: client)
    service._test_client = client
    return service


class TestActiveWarnings:
    @pytest.mark.asyncio
    async def test_実形の注意報が発表中に出る(self, monkeypatch):
        active = await _service(monkeypatch, [ADVISORY, REAL_FORECAST_REPORT]).get_active_warnings()
        assert len(active) == 1
        assert active[0].warning_level == "advisory"
        assert active[0].id == "20261022010500"
        # 発表中の区域だけ（予報の区域は含めない）
        assert [a["code"] for a in active[0].areas] == ["210"]

    @pytest.mark.asyncio
    async def test_解除済みの注意報は発表中に出ない(self, monkeypatch):
        assert await _service(monkeypatch, [LIFTED, ADVISORY]).get_active_warnings() == []

    @pytest.mark.asyncio
    async def test_実データの予報だけなら0件(self, monkeypatch):
        assert await _service(monkeypatch, [REAL_FORECAST_REPORT]).get_active_warnings() == []

    @pytest.mark.asyncio
    async def test_nameキーの形は注意報として数えない(self, monkeypatch):
        """実在しない形で緑になる退行を止める。種別を読むのは kind キー。"""
        active = await _service(monkeypatch, [NAME_KEY_SHAPE]).get_active_warnings()
        assert all(a.warning_level != "advisory" for a in active)

    @pytest.mark.asyncio
    async def test_注意報の文面で警報の避難指示を出さない(self, monkeypatch):
        """title は「津波警報・注意報・予報」なので、title の部分一致では警報文になってしまう。"""
        active = await _service(monkeypatch, [ADVISORY]).get_active_warnings()
        assert "直ちに高台へ避難" not in active[0].message
        assert "海岸から離れて" in active[0].message

    @pytest.mark.asyncio
    async def test_警報は避難の文面(self, monkeypatch):
        active = await _service(monkeypatch, [WARNING]).get_active_warnings()
        assert active[0].warning_level == "warning"
        assert "直ちに高台へ避難" in active[0].message

    @pytest.mark.asyncio
    async def test_取得失敗は従来どおり空(self, monkeypatch):
        service = _service(monkeypatch, json.JSONDecodeError("x", "<html>", 0))
        assert await service.get_active_warnings() == []

    @pytest.mark.asyncio
    async def test_厳密版は取得失敗を例外で返す(self, monkeypatch):
        service = _service(monkeypatch, json.JSONDecodeError("x", "<html>", 0))
        with pytest.raises(ValueError):
            await service.fetch_active_warnings()


class TestHistoryList:
    @pytest.mark.asyncio
    async def test_一覧の各報の階級もkindキーで判定する(self, monkeypatch):
        reports = await _service(monkeypatch, [WARNING, REAL_FORECAST_REPORT]).get_tsunami_list()
        assert [r.warning_level for r in reports] == ["warning", "none"]

    @pytest.mark.asyncio
    async def test_一覧で解除報を注意報にしない(self, monkeypatch):
        reports = await _service(monkeypatch, [LIFTED]).get_tsunami_list()
        assert reports[0].warning_level == "none"

    @pytest.mark.asyncio
    async def test_一覧の壊れた本文は500にせず空(self, monkeypatch):
        service = _service(monkeypatch, json.JSONDecodeError("x", "<html>", 0))
        assert await service.get_tsunami_list() == []


class TestEndpoint:
    @pytest.mark.asyncio
    async def test_active_エンドポイントが実形の注意報を返す(self, client, monkeypatch):
        monkeypatch.setattr(main_module.limiter, "enabled", False)
        client_stub = _Client([ADVISORY])
        monkeypatch.setattr(main_module.tsunami_service, "_get_client", lambda: client_stub)
        res = await client.get("/api/v1/tsunami/active")
        assert res.status_code == 200
        body = res.json()
        assert [t["warning_level"] for t in body] == ["advisory"]


class TestSse:
    @pytest.mark.asyncio
    async def test_SSEが実形の注意報を配信する(self, monkeypatch):
        manager = EventManager()
        manager._tsunami_service = _service(monkeypatch, [ADVISORY])
        queue = await manager.connect()
        await manager._check_tsunamis()
        message = queue.get_nowait()
        assert message.startswith("event: tsunami")
        payload = json.loads(message.split("data: ", 1)[1])
        assert [t["warning_level"] for t in payload["tsunamis"]] == ["advisory"]

    @pytest.mark.asyncio
    async def test_取得失敗で発表中を空に上書き配信しない(self, monkeypatch):
        """一時的な取得失敗で「津波警報なし」を配信すると、画面の警報が消える。"""
        manager = EventManager()
        service = _service(monkeypatch, [ADVISORY])
        manager._tsunami_service = service
        queue = await manager.connect()
        await manager._check_tsunamis()
        queue.get_nowait()

        service._test_client.payload = httpx.ConnectError("down")
        await manager._check_tsunamis()
        assert queue.empty(), "取得失敗なのに配信した"

    @pytest.mark.asyncio
    async def test_解除されたら空を配信する(self, monkeypatch):
        manager = EventManager()
        service = _service(monkeypatch, [ADVISORY])
        manager._tsunami_service = service
        queue = await manager.connect()
        await manager._check_tsunamis()
        queue.get_nowait()

        service._test_client.payload = [LIFTED, ADVISORY]
        await manager._check_tsunamis()
        payload = json.loads(queue.get_nowait().split("data: ", 1)[1])
        assert payload["tsunamis"] == []


# ---- DIR レビュー must-fix（2026-10-22）----

def _broken_fields_report() -> dict:
    """発表中だが、必須の文字列項目が null・欠落している報（anm=null・ttl=null・ctt 欠落）。"""
    report = _report("20261022010500", "20261022010000", [("210", "津波警報")])
    report["anm"] = None
    report["ttl"] = None
    report["mag"] = None
    del report["ctt"]
    return report


class TestEndpointFailure:
    @pytest.mark.asyncio
    async def test_上流の取得失敗は503で空配列にしない(self, client, monkeypatch):
        """200 の [] を返すと、フロントは「津波なし」と受け取り表示中の警報を消す。"""
        monkeypatch.setattr(main_module.limiter, "enabled", False)
        stub = _Client(httpx.ConnectError("down"))
        monkeypatch.setattr(main_module.tsunami_service, "_get_client", lambda: stub)
        res = await client.get("/api/v1/tsunami/active")
        assert res.status_code == 503

    @pytest.mark.asyncio
    async def test_壊れた本文も503(self, client, monkeypatch):
        monkeypatch.setattr(main_module.limiter, "enabled", False)
        stub = _Client(json.JSONDecodeError("x", "<html>", 0))
        monkeypatch.setattr(main_module.tsunami_service, "_get_client", lambda: stub)
        res = await client.get("/api/v1/tsunami/active")
        assert res.status_code == 503

    @pytest.mark.asyncio
    async def test_確認済みの0件は200で空配列(self, client, monkeypatch):
        monkeypatch.setattr(main_module.limiter, "enabled", False)
        stub = _Client([REAL_FORECAST_REPORT])
        monkeypatch.setattr(main_module.tsunami_service, "_get_client", lambda: stub)
        res = await client.get("/api/v1/tsunami/active")
        assert res.status_code == 200
        assert res.json() == []


class TestBrokenFieldsStillShown:
    @pytest.mark.asyncio
    async def test_必須項目がnullでも発表中の報を捨てない(self, monkeypatch):
        active = await _service(monkeypatch, [_broken_fields_report()]).fetch_active_warnings()
        assert len(active) == 1
        assert active[0].warning_level == "warning"
        assert active[0].event_id == "20261022010000"
        assert active[0].id, "ctt が無くても id は空にしない（SSE の差分・閉じた警報の抑制に使う）"
        assert [a["code"] for a in active[0].areas] == ["210"]
        assert "None" not in active[0].message

    @pytest.mark.asyncio
    async def test_必須項目がnullでもactiveエンドポイントに出る(self, client, monkeypatch):
        monkeypatch.setattr(main_module.limiter, "enabled", False)
        stub = _Client([_broken_fields_report()])
        monkeypatch.setattr(main_module.tsunami_service, "_get_client", lambda: stub)
        res = await client.get("/api/v1/tsunami/active")
        assert res.status_code == 200
        assert [t["warning_level"] for t in res.json()] == ["warning"]

    @pytest.mark.asyncio
    async def test_必須項目がnullでもSSEに出る(self, monkeypatch):
        manager = EventManager()
        manager._tsunami_service = _service(monkeypatch, [_broken_fields_report()])
        queue = await manager.connect()
        await manager._check_tsunamis()
        payload = json.loads(queue.get_nowait().split("data: ", 1)[1])
        assert [t["warning_level"] for t in payload["tsunamis"]] == ["warning"]

    @pytest.mark.asyncio
    async def test_モデルの組み立て自体が失敗しても最小限の項目で出す(self, monkeypatch):
        """正規化をすり抜ける想定外の形でも、発表中の報は捨てない。"""
        service = _service(monkeypatch, [_broken_fields_report()])

        def boom(item, warning_level):
            raise TypeError("unexpected shape")

        monkeypatch.setattr(service, "_build_tsunami_info", boom)
        active = await service.fetch_active_warnings()
        assert len(active) == 1
        assert active[0].warning_level == "warning"
        assert active[0].event_id == "20261022010000"
        assert [a["code"] for a in active[0].areas] == ["210"]

    @pytest.mark.asyncio
    async def test_履歴一覧でもnullの項目で落とさない(self, monkeypatch):
        reports = await _service(monkeypatch, [_broken_fields_report()]).get_tsunami_list()
        assert len(reports) == 1
        assert reports[0].earthquake_location == ""
        assert reports[0].title == ""
