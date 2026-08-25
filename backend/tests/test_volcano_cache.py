"""火山情報の TTL キャッシュと取得経路。

レビュー指摘の固定:
- 従来はリクエストごとに JMA へ 2 回外部 HTTP（warning.json + volcano_list.json）。
  カタログは年単位でしか変わらないのに毎回引き直していた
- response.json() のデコード失敗（ValueError）が httpx.HTTPError で捕捉できず
  500 になっていた
- 旧実装は存在しない `data/warning/{火山コード}.json` を火山ごとに叩いて
  404 を握りつぶし、噴火警報が一度もゼロ件以外にならなかった
"""
import json

import pytest

from app.services import volcano_service as volcano_module
from app.services.volcano_service import VolcanoService

VOLCANO_LIST = [
    {"code": "503", "latlon": ["32.884", "131.104"], "name_jp": "阿蘇山",
     "name_en": "Asosan", "levelOperation": True},
]

WARNING_DATA = [
    {
        "reportDatetime": "2026-08-20T14:00:00+09:00",
        "eventId": "503",
        "areas": ["4342300"],
        "volcanoInfos": [
            {
                "type": "噴火警報・予報（対象火山）",
                "items": [{
                    "name": "レベル３（入山規制）", "code": "13", "lastCode": "12",
                    "condition": "引上げ",
                    "areas": [{"name": "阿蘇山", "code": "503"}],
                }],
            },
        ],
    },
]


class _Response:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _BrokenResponse:
    def raise_for_status(self):
        return None

    def json(self):
        raise json.JSONDecodeError("Expecting value", "<html>", 0)


class _CountingClient:
    """叩かれた URL を記録するスタブ。broken=True で壊れた本文を返す。"""

    def __init__(self, broken: bool = False):
        self.requests: list[str] = []
        self.broken = broken

    async def get(self, url, timeout=None):
        self.requests.append(url)
        if self.broken:
            return _BrokenResponse()
        if "volcano_list" in url:
            return _Response(VOLCANO_LIST)
        if url.endswith("data/warning.json"):
            return _Response(WARNING_DATA)
        raise AssertionError(f"想定外の URL: {url}")


@pytest.fixture
def service(monkeypatch):
    service = VolcanoService()
    client = _CountingClient()
    monkeypatch.setattr(service, "_get_client", lambda: client)
    service._test_client = client
    return service


class TestFetchPath:
    @pytest.mark.asyncio
    async def test_火山ごとのURLを叩かない(self, service):
        """存在しない `data/warning/{code}.json` に戻っていないこと。

        以前は inspect.getsource でソース文字列を見ていたが、それは
        「文字列がソースに書いてあるか」の代理指標でしかない。
        ここでは**実際に叩かれた URL** を検証する。
        """
        await service.get_volcano_warnings()
        per_volcano = [u for u in service._test_client.requests if "/data/warning/" in u]
        assert per_volcano == [], f"火山ごとの URL を叩いている: {per_volcano}"
        assert any(u.endswith("data/warning.json") for u in service._test_client.requests)

    @pytest.mark.asyncio
    async def test_警報とカタログを1回ずつ取る(self, service):
        warnings = await service.get_volcano_warnings()
        assert len(warnings) == 1
        assert warnings[0].volcano_name_en == "Asosan"
        assert len(service._test_client.requests) == 2


class TestTtlCache:
    @pytest.mark.asyncio
    async def test_TTL内の再呼び出しは外部HTTPを増やさない(self, service):
        await service.get_volcano_warnings()
        first = len(service._test_client.requests)
        await service.get_volcano_warnings()
        await service.get_volcano_list()
        assert len(service._test_client.requests) == first, (
            "TTL 内の再呼び出しが JMA へ再リクエストしている"
        )

    @pytest.mark.asyncio
    async def test_TTLが切れたら取り直す(self, service, monkeypatch):
        clock = {"now": 1000.0}
        monkeypatch.setattr(volcano_module.time, "monotonic", lambda: clock["now"])
        await service.get_volcano_warnings()
        first = len(service._test_client.requests)

        clock["now"] += VolcanoService.WARNING_TTL_SECONDS + 1
        await service.get_volcano_warnings()
        # warning.json は取り直し、カタログ（TTL 6時間）はキャッシュのまま
        assert len(service._test_client.requests) == first + 1

    @pytest.mark.asyncio
    async def test_キャッシュは生JSONなので言語別書き換えが漏れない(self, service):
        """エンドポイントは返ってきた VolcanoWarning を言語別に書き換える。

        パース済みオブジェクトをキャッシュすると 1 人目の言語が 2 人目に漏れる。
        呼び出しごとに別インスタンスが返ることを固定する。
        """
        first = await service.get_volcano_warnings()
        second = await service.get_volcano_warnings()
        assert first[0] is not second[0]
        first[0].alert_level_name = "汚染された値"
        assert second[0].alert_level_name != "汚染された値"


class TestDecodeFailure:
    @pytest.mark.asyncio
    async def test_壊れたJSONで500にならない(self, monkeypatch):
        service = VolcanoService()
        monkeypatch.setattr(service, "_get_client", lambda: _CountingClient(broken=True))
        assert await service.get_volcano_warnings() == []
        assert await service.get_volcano_list() == []

    @pytest.mark.asyncio
    async def test_取得失敗時は期限切れキャッシュへ落ちる(self, monkeypatch):
        """JMA が落ちている間も、直近の成功値で警報を出し続けること。

        災害情報アプリでは「発表時刻つきの少し古い警報」の方が
        「何も出ない画面」よりはるかにましという判断（sw.js のタイルと同じ）。
        """
        service = VolcanoService()
        good = _CountingClient()
        monkeypatch.setattr(service, "_get_client", lambda: good)

        clock = {"now": 1000.0}
        monkeypatch.setattr(volcano_module.time, "monotonic", lambda: clock["now"])
        first = await service.get_volcano_warnings()
        assert len(first) == 1

        # TTL を切らしてから JMA を故障させる
        clock["now"] += VolcanoService.WARNING_TTL_SECONDS + 1
        broken = _CountingClient(broken=True)
        monkeypatch.setattr(service, "_get_client", lambda: broken)

        stale = await service.get_volcano_warnings()
        assert len(stale) == 1, "期限切れキャッシュへのフォールバックが働いていない"
        assert stale[0].volcano_name == "阿蘇山"
