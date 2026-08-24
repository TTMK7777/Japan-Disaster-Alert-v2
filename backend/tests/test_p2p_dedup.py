"""P2P 地震情報の重複排除と未確定値の扱い。

実データで観測した事象を固定する（2026-08-23、浦河沖 M6）:
P2P の `id` は「地震」ではなく「**発表**」に振られるため、1つの地震について
気象庁が段階的に出す複数レポートがそれぞれ別カードとして画面に並んでいた。
同じ地震が「震度4」と「震度不明」の2枚で出たり、規模未確定の速報が
「M-1」と表示されたりしていた。
"""
import pytest

from app.services.p2p_service import P2PQuakeService


def _report(report_id: str, *, time: str, name: str, magnitude, depth, max_scale: int) -> dict:
    """P2P /history の1レポート分の生データ形。"""
    return {
        "id": report_id,
        "earthquake": {
            "time": time,
            "maxScale": max_scale,
            "domesticTsunami": "None",
            "hypocenter": {
                "name": name,
                "magnitude": magnitude,
                "depth": depth,
                "latitude": 42.0,
                "longitude": 142.5,
            },
        },
    }


# 実測した浦河沖 2026/08/23 22:45:00 の4レポート。
# 詳細 → 震源速報 → 震度速報×2 の順（P2P /history は新しい順に返す）
URAKAWA = "2026/08/23 22:45:00"
DETAIL_SCALE = _report("detail", time=URAKAWA, name="浦河沖", magnitude=6, depth=40, max_scale=40)
DESTINATION = _report("dest", time=URAKAWA, name="浦河沖", magnitude=6, depth=40, max_scale=-1)
SCALE_PROMPT_1 = _report("prompt1", time=URAKAWA, name="", magnitude=-1, depth=-1, max_scale=40)
SCALE_PROMPT_2 = _report("prompt2", time=URAKAWA, name="", magnitude=-1, depth=-1, max_scale=40)


@pytest.fixture
def service() -> P2PQuakeService:
    return P2PQuakeService()


def _dedup(service: P2PQuakeService, raw_reports: list[dict]):
    parsed = [service._parse_earthquake(r) for r in raw_reports]
    assert all(p is not None for p in parsed), "パースに失敗したレポートがある"
    return service._deduplicate(parsed)


class TestDeduplicate:
    def test_同じ地震の4レポートが1件にまとまる(self, service):
        result = _dedup(service, [DETAIL_SCALE, DESTINATION, SCALE_PROMPT_1, SCALE_PROMPT_2])
        assert len(result) == 1

    def test_残るのは最も情報が揃ったレポート(self, service):
        """震度・規模・深さ・震源名がすべて揃った詳細版が残ること。

        入力の並び順に依存して先頭が残るだけの実装だと、
        震度速報を先頭にした次のテストで落ちる。
        """
        result = _dedup(service, [DETAIL_SCALE, DESTINATION, SCALE_PROMPT_1])
        assert result[0].max_intensity == "4"
        assert result[0].magnitude == 6
        assert result[0].depth == 40
        assert result[0].location == "浦河沖"

    def test_情報の薄いレポートが先頭でも詳細版が選ばれる(self, service):
        result = _dedup(service, [SCALE_PROMPT_1, DESTINATION, DETAIL_SCALE])
        assert len(result) == 1
        assert result[0].max_intensity == "4"
        assert result[0].magnitude == 6, "先頭を無条件に採用していると M-1 が残る"

    def test_震度不明のレポートだけが残ってはいけない(self, service):
        """「震度4」と「震度不明」の2枚が並んでいた事象そのもの。"""
        result = _dedup(service, [DESTINATION, DETAIL_SCALE])
        assert len(result) == 1
        assert result[0].max_intensity == "4"

    def test_別の地震はまとめない(self, service):
        other = _report("other", time="2026/08/23 21:00:00", name="日向灘",
                        magnitude=5, depth=20, max_scale=30)
        result = _dedup(service, [DETAIL_SCALE, other])
        assert len(result) == 2

    def test_発生時刻が空でも束ねない(self, service):
        """退化ケース。空文字をキーに共有すると全件が1つに潰れ、
        地震が1件しか表示されなくなる。"""
        a = _report("a", time="", name="場所A", magnitude=5, depth=10, max_scale=30)
        b = _report("b", time="", name="場所B", magnitude=4, depth=20, max_scale=20)
        result = _dedup(service, [a, b])
        assert len(result) == 2

    def test_新しい順の並びが保たれる(self, service):
        older = _report("older", time="2026/08/23 21:00:00", name="日向灘",
                        magnitude=5, depth=20, max_scale=30)
        result = _dedup(service, [DETAIL_SCALE, DESTINATION, older])
        assert [e.time for e in result] == [URAKAWA, "2026/08/23 21:00:00"]


class TestUndeterminedValues:
    def test_規模未確定のメッセージに数値を書かない(self, service):
        """震度速報の段階では規模が -1 で届く。
        そのまま埋め込むと「マグニチュード-1」という文が利用者に出る。"""
        eq = service._parse_earthquake(SCALE_PROMPT_1)
        assert "-1" not in eq.message, f"未確定の番兵値が本文に出ている: {eq.message}"

    def test_深さ未確定のメッセージに数値を書かない(self, service):
        eq = service._parse_earthquake(SCALE_PROMPT_1)
        assert "-1km" not in eq.message
        assert "約-1" not in eq.message

    def test_確定値は従来どおり本文に出る(self, service):
        eq = service._parse_earthquake(DETAIL_SCALE)
        assert "マグニチュード6" in eq.message
        assert "40km" in eq.message
        assert "最大震度4" in eq.message


class TestWiredIntoApiPath:
    """`_deduplicate` が**本番の取得経路から実際に呼ばれている**ことを固定する。

    これが無いと、`get_recent_earthquakes` から重複排除の呼び出しを消しても
    上のテスト群は全部緑のまま通ってしまう（実際にミューテーションで確認した）。
    「関数は正しいが、本番はそれを通っていない」という失敗の型を防ぐ。
    """

    async def test_取得経路を通すと重複が排除される(self, service, monkeypatch):
        raw = [DETAIL_SCALE, DESTINATION, SCALE_PROMPT_1, SCALE_PROMPT_2]

        class _StubResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return raw

        class _StubClient:
            async def get(self, url, params=None, timeout=None):
                return _StubResponse()

        monkeypatch.setattr(service, "_get_client", lambda: _StubClient())

        result = await service.get_recent_earthquakes(limit=20)

        assert len(result) == 1, "本番経路で重複排除が効いていない"
        assert result[0].max_intensity == "4"
        assert result[0].magnitude == 6
