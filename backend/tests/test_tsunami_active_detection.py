"""津波の「発表中」判定（共有関数 select_active_tsunami_reports）。

2026-10-22 に実 list.json を取得して判明した事実を固定する:
`kind` 配列の要素は ``{"code": "100", "kind": "津波予報（若干の海面変動）"}`` の形で、
**`name` キーは存在しない**。旧判定は ``kind.get("name")`` を見ていたため
常に "none" になり、津波警報が出ても「発表中」は 0 件だった。
（気象庁 API の落とし穴の 6 件目。合成フィクスチャが `name` を持っていたので緑だった）

したがって、このファイルのフィクスチャは**実レスポンスの形（code / kind のみ）**を正とする。
"""
import json

import pytest

from app.services.tsunami_service import (
    TsunamiService,
    classify_tsunami_kind,
    select_active_tsunami_reports,
)

# 2026-10-22 に取得した実 list.json の 1 件目（kind は 3 区域に省略）
REAL_FORECAST_REPORT = {
    "ctt": "20261010033742",
    "eid": "20261010025608",
    "rdt": "2026-10-10T03:37:00+09:00",
    "ttl": "津波予報",
    "ift": "発表",
    "ser": 0,
    "at": "2026-10-10T02:56:00+09:00",
    "anm": "中米",
    "acd": "945",
    "cod": "+07.5-080.8/",
    "mag": "8.0",
    "kind": [
        {"code": "100", "kind": "津波予報（若干の海面変動）"},
        {"code": "101", "kind": "津波予報（若干の海面変動）"},
        {"code": "102", "kind": "津波予報（若干の海面変動）"},
    ],
    "json": "20261010033742_20261010025608_VTSE41_0.json",
    "en_ttl": "Tsunami Forecast",
    "en_anm": "Central America",
}

# 同じく実 list.json の 2 件目。kind が空配列
REAL_EMPTY_KIND_REPORT = {
    "ctt": "20260930140817",
    "eid": "20260930140037",
    "rdt": "2026-09-30T14:08:00+09:00",
    "ttl": "津波予報",
    "ift": "発表",
    "ser": 0,
    "at": "2026-09-30T14:00:00+09:00",
    "anm": "与那国島近海",
    "acd": "857",
    "cod": "+23.8+122.9-10000/",
    "mag": "6.0",
    "kind": [],
    "json": "20260930140817_20260930140037_VTSE41_0.json",
    "en_ttl": "Tsunami Forecast",
    "en_anm": "Adjacent Sea of Yonagunijima Island",
}


def _report(ctt: str, eid: str, kinds: list[tuple[str, str]], *, ift: str = "発表") -> dict:
    """実 list.json と同じ形（kind の要素は code と kind のみ）の 1 報。"""
    base = dict(REAL_FORECAST_REPORT)
    base.update(
        ctt=ctt,
        eid=eid,
        rdt=f"{ctt[0:4]}-{ctt[4:6]}-{ctt[6:8]}T{ctt[8:10]}:{ctt[10:12]}:00+09:00",
        ttl="津波警報・注意報・予報",
        ift=ift,
        kind=[{"code": code, "kind": kind} for code, kind in kinds],
    )
    return base


class TestRealShape:
    def test_実データのkind要素にnameキーは無い(self):
        """フィクスチャ自体が実形であること（name を足して緑にする退行を止める）。"""
        for report in (REAL_FORECAST_REPORT, REAL_EMPTY_KIND_REPORT):
            for kind in report["kind"]:
                assert set(kind) == {"code", "kind"}

    def test_実データの予報だけなら発表中は0件(self):
        assert select_active_tsunami_reports([REAL_FORECAST_REPORT, REAL_EMPTY_KIND_REPORT]) == []

    def test_実形の注意報は発表中になる(self):
        """旧判定（kind.get("name")）ではここが 0 件だった。"""
        advisory = _report("20261022010500", "20261022010000", [("100", "津波注意報")])
        active = select_active_tsunami_reports([advisory])
        assert len(active) == 1
        assert active[0].level == "advisory"
        assert [(a.code, a.level) for a in active[0].areas] == [("100", "advisory")]


class TestClassify:
    @pytest.mark.parametrize(
        "name,level",
        [
            ("大津波警報", "major_warning"),
            ("大津波警報：発表", "major_warning"),
            ("津波警報", "warning"),
            ("津波注意報", "advisory"),
            ("津波予報（若干の海面変動）", "forecast"),
            ("津波なし", "none"),
            ("警報解除", "cancelled"),
            ("津波注意報解除", "cancelled"),
        ],
    )
    def test_既知の種別は完全一致で分類する(self, name, level):
        assert classify_tsunami_kind(name) == level

    def test_解除は部分一致で注意報扱いにしない(self):
        """「津波注意報解除」は「津波注意報」を含むが、発表中ではない。"""
        assert classify_tsunami_kind("津波注意報解除") != "advisory"

    @pytest.mark.parametrize("name", ["津波注意報（訂正）", "", "新しい種別"])
    def test_未知の種別はunknown(self, name):
        assert classify_tsunami_kind(name) == "unknown"


class TestLifecycle:
    def test_eidごとの最新報だけを見る_解除済みは発表中にしない(self):
        issued = _report("20261022010500", "20261022010000", [("100", "津波注意報")])
        lifted = _report("20261022030000", "20261022010000", [("100", "津波注意報解除")])
        # list.json は新しい順だが、順序に依存しないこと
        assert select_active_tsunami_reports([lifted, issued]) == []
        assert select_active_tsunami_reports([issued, lifted]) == []

    def test_最新報が予報へ引下げなら発表中にしない(self):
        issued = _report("20261022010500", "20261022010000", [("100", "津波警報")])
        down = _report("20261022020000", "20261022010000", [("100", "津波予報（若干の海面変動）")])
        assert select_active_tsunami_reports([down, issued]) == []

    def test_一部区域だけ解除なら残りの区域は発表中のまま(self):
        """解除を含む報でも、まだ注意報の区域がある限り発表中から消さない。"""
        partial = _report(
            "20261022020000",
            "20261022010000",
            [("100", "津波注意報"), ("101", "津波注意報解除")],
        )
        active = select_active_tsunami_reports([partial])
        assert len(active) == 1
        assert [a.code for a in active[0].areas] == ["100"]

    def test_最新報が警報へ引上げなら警報(self):
        first = _report("20261022010500", "20261022010000", [("100", "津波注意報")])
        up = _report("20261022011500", "20261022010000", [("100", "津波警報"), ("101", "津波注意報")])
        active = select_active_tsunami_reports([first, up])
        assert len(active) == 1
        assert active[0].level == "warning"
        assert active[0].report["ctt"] == "20261022011500"

    def test_取消報は発表中にしない(self):
        issued = _report("20261022010500", "20261022010000", [("100", "津波注意報")])
        cancelled = _report("20261022011000", "20261022010000", [("100", "津波注意報")], ift="取消")
        assert select_active_tsunami_reports([cancelled, issued]) == []

    def test_別のイベントは別々に判定する(self):
        a = _report("20261022010500", "20261022010000", [("100", "津波注意報")])
        b_issued = _report("20261022020500", "20261022020000", [("300", "大津波警報")])
        b_lifted = _report("20261022050000", "20261022020000", [("300", "警報解除")])
        active = select_active_tsunami_reports([b_lifted, b_issued, a])
        assert [r.report["eid"] for r in active] == ["20261022010000"]

    def test_重い順に並ぶ(self):
        a = _report("20261022010500", "20261022010000", [("100", "津波注意報")])
        b = _report("20261022020500", "20261022020000", [("300", "大津波警報")])
        active = select_active_tsunami_reports([a, b])
        assert [r.level for r in active] == ["major_warning", "advisory"]


class TestUnknown:
    def test_未知の種別だけの最新報はunknownとして残す(self):
        """語彙が変わっても 0 件に潰さず、見える形で残す。"""
        odd = _report("20261022010500", "20261022010000", [("100", "新しい種別")])
        active = select_active_tsunami_reports([odd])
        assert len(active) == 1
        assert active[0].level == "unknown"
        assert active[0].areas[0].kind_ja == "新しい種別"

    def test_既知の発表中と未知が混在したら既知の重い方を全体の階級にする(self):
        mixed = _report("20261022010500", "20261022010000", [("100", "新しい種別"), ("101", "津波警報")])
        active = select_active_tsunami_reports([mixed])
        assert active[0].level == "warning"
        assert {a.code for a in active[0].areas} == {"100", "101"}

    def test_dictでない要素や壊れたkindは飛ばす(self):
        broken = _report("20261022010500", "20261022010000", [("100", "津波注意報")])
        broken["kind"].append("壊れた要素")
        active = select_active_tsunami_reports(["壊れた報", broken])
        assert len(active) == 1
        assert [a.code for a in active[0].areas] == ["100"]


class _Response:
    def __init__(self, payload=None, *, broken=False):
        self._payload = payload
        self._broken = broken

    def raise_for_status(self):
        return None

    def json(self):
        if self._broken:
            raise json.JSONDecodeError("Expecting value", "<html>", 0)
        return self._payload


class TestFetchReports:
    @pytest.mark.asyncio
    async def test_取得成功なら生の一覧を返す(self, monkeypatch):
        service = TsunamiService()

        class _Client:
            async def get(self, url, timeout=None):
                assert url.endswith("/tsunami/data/list.json")
                return _Response([REAL_FORECAST_REPORT])

        monkeypatch.setattr(service, "_get_client", lambda: _Client())
        assert await service.fetch_tsunami_reports() == [REAL_FORECAST_REPORT]

    @pytest.mark.asyncio
    async def test_壊れた本文は例外にする_0件にしない(self, monkeypatch):
        service = TsunamiService()

        class _Client:
            async def get(self, url, timeout=None):
                return _Response(broken=True)

        monkeypatch.setattr(service, "_get_client", lambda: _Client())
        with pytest.raises(ValueError):
            await service.fetch_tsunami_reports()

    @pytest.mark.asyncio
    async def test_配列でない本文は例外にする(self, monkeypatch):
        service = TsunamiService()

        class _Client:
            async def get(self, url, timeout=None):
                return _Response({"error": "maintenance"})

        monkeypatch.setattr(service, "_get_client", lambda: _Client())
        with pytest.raises(ValueError):
            await service.fetch_tsunami_reports()
