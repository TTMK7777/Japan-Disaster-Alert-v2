"""噴火警報。

## なぜこのテストが要るか

従来の実装は火山ごとに `bosai/volcano/data/warning/{火山コード}.json` を叩いていたが、
**このURLは存在せず 404 を返す**。例外を握って None を返す作りだったため、
エラーも出ないまま**噴火警報は一度もゼロ件以外にならなかった**。
CLAUDE.md に記録済みの「存在しないコードは 404 を握りつぶして永久ゼロ件」と同型で、
気象庁 API で 5 回目の同じ失敗にあたる。

正しくは `bosai/volcano/data/warning.json` の 1 本に発表中の警報がすべて入る。
下の `WARNING_FIXTURE` は 2026-08-25 に実 API から取得した形をそのまま写している。
"""
import pytest

from app.models import VolcanoInfo
from app.services.volcano_levels import (
    GENERIC_WARNING,
    LEVEL_ACTIONS,
    LEVEL_LABEL,
    LEVEL_NAMES,
    LEVEL_SEVERITY,
    WARNING_TYPES,
    localize_volcano_name,
    localize_warning,
)
from app.services.volcano_service import VolcanoService, extract_level, warning_type_severity

LANGS = [
    "ja", "en", "zh", "zh-TW", "ko", "vi", "th", "id",
    "ms", "tl", "ne", "fr", "de", "it", "es", "easy_ja",
]

#: 実 API のレスポンスから写したレコード。3 つの type が並ぶ構造まで含めている
WARNING_FIXTURE = [
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
            {
                "type": "噴火警報・予報（対象市町村等）",
                "items": [{
                    "name": "火口周辺警報", "code": "02", "lastCode": "02", "condition": "切替",
                    "areas": [
                        {"name": "熊本県阿蘇市", "code": "4342300"},
                        {"name": "熊本県南阿蘇村", "code": "4342800"},
                    ],
                }],
            },
            {
                "type": "噴火警報・予報（対象市町村の防災対応等）",
                "items": [{
                    "name": "火口周辺警報：入山規制等", "code": "49", "lastCode": "49",
                    "condition": "継続",
                    "areas": [{"name": "熊本県阿蘇市", "code": "4342300"}],
                }],
            },
        ],
    },
    {
        "reportDatetime": "2007-12-01T10:01:00+09:00",
        "eventId": "329",
        "areas": ["1342100"],
        "volcanoInfos": [
            {
                "type": "噴火警報・予報（対象火山）",
                "items": [{
                    "name": "火口周辺危険", "code": "22", "lastCode": "22", "condition": "継続",
                    "areas": [{"name": "硫黄島", "code": "329"}],
                }],
            },
            {
                "type": "噴火警報・予報（対象市町村等）",
                "items": [{
                    "name": "火口周辺警報", "code": "02", "lastCode": "02", "condition": "切替",
                    "areas": [{"name": "東京都小笠原村", "code": "1342100"}],
                }],
            },
        ],
    },
    {
        "reportDatetime": "2026-08-01T09:00:00+09:00",
        "eventId": "331",
        "areas": ["1342100"],
        "volcanoInfos": [
            {
                "type": "噴火警報・予報（対象火山）",
                "items": [{
                    "name": "周辺海域警戒", "code": "36", "lastCode": "36", "condition": "引上げ",
                    "areas": [{"name": "福徳岡ノ場", "code": "331"}],
                }],
            },
        ],
    },
    {
        # 解除された警報。画面に出してはいけない
        "reportDatetime": "2026-08-22T11:00:00+09:00",
        "eventId": "312",
        "areas": ["1438200"],
        "volcanoInfos": [
            {
                "type": "噴火警報・予報（対象火山）",
                "items": [{
                    "name": "活火山であることに留意", "code": "21", "lastCode": "12",
                    "condition": "解除",
                    "areas": [{"name": "箱根山", "code": "312"}],
                }],
            },
        ],
    },
]

CATALOGUE = {
    "503": VolcanoInfo(code="503", name="阿蘇山", name_en="Asosan", latitude=32.884, longitude=131.104),
    "329": VolcanoInfo(code="329", name="硫黄島", name_en="Ioto", latitude=24.751, longitude=141.289),
    "331": VolcanoInfo(code="331", name="福徳岡ノ場", name_en="Fukutoku-Okanoba"),
    "312": VolcanoInfo(code="312", name="箱根山", name_en="Hakoneyama"),
}


@pytest.fixture
def service() -> VolcanoService:
    return VolcanoService()


def parse_all(service: VolcanoService) -> list:
    result = []
    for record in WARNING_FIXTURE:
        result.extend(service._parse_warning_record(record, CATALOGUE))
    return result


class TestEndpointUrl:
    def test_火山ごとにURLを組み立てない(self, service):
        """存在しない `data/warning/{code}.json` に戻っていないこと。

        この形の URL は 404 を返し、例外を握るので**エラーも出さずに永久ゼロ件**になる。
        実際にそうなっていて誰も気づかなかった。
        """
        import inspect

        source = inspect.getsource(VolcanoService.get_volcano_warnings)
        assert "data/warning.json" in source
        assert "warning/{" not in source


class TestParsing:
    def test_対象火山の警報だけを拾う(self, service):
        warnings = parse_all(service)
        names = [w.volcano_name for w in warnings]
        # 市町村名（熊本県阿蘇市など）が火山名の位置に紛れ込んでいないこと
        assert "熊本県阿蘇市" not in names
        assert "東京都小笠原村" not in names
        assert "阿蘇山" in names

    def test_解除された警報を出さない(self, service):
        warnings = parse_all(service)
        assert all(w.volcano_name != "箱根山" for w in warnings), "解除済みの警報が残っている"
        assert all(w.condition != "解除" for w in warnings)

    def test_発表中の件数(self, service):
        # 4 レコード中 1 件が解除なので 3 件
        assert len(parse_all(service)) == 3

    def test_継続中の判定(self, service):
        by_name = {w.volcano_name: w for w in parse_all(service)}
        # 気象庁は変化がない限り発表日時を更新しない。2007 年の日時を
        # 「発表時刻」として見せると今起きたことに見える
        assert by_name["硫黄島"].is_continuing is True
        assert by_name["阿蘇山"].is_continuing is False

    def test_火山名の英字表記と座標を引く(self, service):
        by_name = {w.volcano_name: w for w in parse_all(service)}
        assert by_name["阿蘇山"].volcano_name_en == "Asosan"
        assert by_name["阿蘇山"].latitude == pytest.approx(32.884)

    def test_対象市町村を集める(self, service):
        by_name = {w.volcano_name: w for w in parse_all(service)}
        assert by_name["阿蘇山"].municipalities == ["熊本県阿蘇市", "熊本県南阿蘇村"]

    def test_レベル制でない火山はレベルを持たない(self, service):
        by_name = {w.volcano_name: w for w in parse_all(service)}
        assert by_name["硫黄島"].alert_level is None
        assert by_name["福徳岡ノ場"].alert_level is None

    def test_コードが文字列で保たれる(self, service):
        # volcano_list.json の code は文字列。int にすると突き合わせできない
        by_name = {w.volcano_name: w for w in parse_all(service)}
        assert by_name["阿蘇山"].volcano_code == "503"


class TestLevelExtraction:
    @pytest.mark.parametrize(
        "name,expected",
        [
            ("レベル１（活火山であることに留意）", 1),
            ("レベル２（火口周辺規制）", 2),
            ("レベル３（入山規制）", 3),
            ("レベル４（高齢者等避難）", 4),
            ("レベル５（避難）", 5),
            # 半角で来ても拾う
            ("レベル3（入山規制）", 3),
            # レベル制でない火山
            ("火口周辺危険", None),
            ("入山危険", None),
            ("周辺海域警戒", None),
            ("活火山であることに留意", None),
            ("", None),
        ],
    )
    def test_レベルの取り出し(self, name, expected):
        assert extract_level(name) == expected

    def test_全角数字を取りこぼさない(self):
        # 気象庁は全角で書く。半角前提だと全件 None になる
        assert extract_level("レベル２（火口周辺規制）") == 2


class TestSeverity:
    @pytest.mark.parametrize("level,expected", [(1, "advisory"), (2, "advisory"), (3, "high"), (4, "high"), (5, "extreme")])
    def test_レベルと重大度の対応(self, level, expected):
        """利用者が取る行動で決める。

        気象庁の警報種別（レベル2・3 = 火口周辺警報）をそのまま写すと
        実データ 14 件中 9 件が赤で並び、本当に入山できないレベル3 が埋もれた。
        レベル2 は火口の縁だけの閉鎖なので、いる場所が危険という意味ではない。
        """
        assert LEVEL_SEVERITY[level] == expected

    def test_レベル3で初めて塗りつぶしになる(self):
        # 「入山規制」は旅程を直接止めるので、ここが境界
        assert LEVEL_SEVERITY[2] == "advisory"
        assert LEVEL_SEVERITY[3] == "high"

    def test_レベル制でない火山の重大度(self):
        assert warning_type_severity("火口周辺危険") == "high"
        assert warning_type_severity("入山危険") == "high"
        assert warning_type_severity("周辺海域警戒") == "advisory"

    def test_未知の警報名は軽く扱わない(self):
        assert warning_type_severity("見たことのない警報") == "high"

    def test_危険な順に並ぶ(self, service):
        warnings = parse_all(service)
        order = {"extreme": 0, "high": 1, "advisory": 2}
        ranks = [order[w.severity] for w in warnings]
        assert ranks == sorted(ranks)


class TestTranslations:
    @pytest.mark.parametrize("lang", LANGS)
    def test_全レベルが16言語そろっている(self, lang):
        for level in (1, 2, 3, 4, 5):
            assert LEVEL_NAMES[level].get(lang), f"レベル{level} の {lang} が無い"
            assert LEVEL_ACTIONS[level].get(lang), f"レベル{level} の防災対応の {lang} が無い"

    @pytest.mark.parametrize("lang", LANGS)
    def test_レベル制でない警報種別が16言語そろっている(self, lang):
        for name, entry in WARNING_TYPES.items():
            assert entry.get(lang), f"{name} の {lang} が無い"

    @pytest.mark.parametrize("lang", LANGS)
    def test_総称とラベルが16言語そろっている(self, lang):
        assert GENERIC_WARNING.get(lang)
        assert LEVEL_LABEL.get(lang)
        assert "{level}" in LEVEL_LABEL[lang]

    @pytest.mark.parametrize("lang", LANGS)
    def test_レベルから訳が引ける(self, lang):
        name, action = localize_warning(level=3, name_ja="レベル３（入山規制）", lang=lang)
        assert name == LEVEL_NAMES[3][lang]
        assert action == LEVEL_ACTIONS[3][lang]

    @pytest.mark.parametrize("lang", LANGS)
    def test_レベル制でない警報から訳が引ける(self, lang):
        name, action = localize_warning(level=None, name_ja="周辺海域警戒", lang=lang)
        assert name == WARNING_TYPES["周辺海域警戒"][lang]
        assert action == ""

    @pytest.mark.parametrize("lang", LANGS)
    def test_未知の警報名は総称に落ちる(self, lang):
        name, _ = localize_warning(level=None, name_ja="見たことのない警報", lang=lang)
        assert name == GENERIC_WARNING[lang]
        # 日本語をそのまま画面へ出さない
        if lang not in ("ja", "easy_ja", "zh", "zh-TW"):
            assert "警報" not in name

    def test_未対応の言語は英語に落ちる(self):
        # 日本語へ直接落とすと読めない文字が出る
        name, action = localize_warning(level=3, name_ja="レベル３（入山規制）", lang="sw")
        assert name == LEVEL_NAMES[3]["en"]
        assert action == LEVEL_ACTIONS[3]["en"]


class TestVolcanoNameLocalization:
    @pytest.mark.parametrize("lang", ["ja", "easy_ja", "zh", "zh-TW"])
    def test_漢字圏は日本語表記のまま(self, lang):
        assert localize_volcano_name("阿蘇山", "Asosan", lang) == "阿蘇山"

    @pytest.mark.parametrize("lang", ["en", "ko", "vi", "th", "ne", "fr", "de", "it", "es", "id", "ms", "tl"])
    def test_それ以外は気象庁の英字表記(self, lang):
        assert localize_volcano_name("阿蘇山", "Asosan", lang) == "Asosan"

    def test_英字表記が無ければ日本語へ落ちる(self):
        # 元データで name_en が欠けている火山が 120 件中 1 件ある
        assert localize_volcano_name("阿蘇山", None, "en") == "阿蘇山"


class TestUnwiredRegression:
    """この機能が「配線されていない」状態に戻っていないこと。"""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("lang", ["en", "fr", "ko"])
    async def test_エンドポイントが翻訳して返す(self, client, monkeypatch, lang):
        """応答そのものを見る。

        最初は `inspect.getsource` に localize_warning の文字列が含まれるかを
        見ていたが、翻訳の代入を消すミューテーションが素通りした。
        「呼んでいるように見えるコード」ではなく「訳された値が返ること」を見る。
        """
        from app import main

        async def stub():
            return [
                main.VolcanoWarning(
                    volcano_code="503", volcano_name="阿蘇山", volcano_name_en="Asosan",
                    alert_level=3, alert_level_name="レベル３（入山規制）",
                    warning_name_ja="レベル３（入山規制）", severity="high",
                    condition="引上げ", issued_at="2026-08-20T14:00:00+09:00",
                )
            ]

        monkeypatch.setattr(main.volcano_service, "get_volcano_warnings", stub)
        monkeypatch.setattr(main.limiter, "enabled", False)

        response = await client.get(f"/api/v1/volcanoes/warnings?lang={lang}")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        item = body[0]

        assert item["alert_level_name"] == LEVEL_NAMES[3][lang], "警報名が訳されていない"
        assert item["action"] == LEVEL_ACTIONS[3][lang], "防災対応が訳されていない"
        assert item["volcano_name"] == "Asosan", "火山名が訳されていない"
        # 日本語が残っていないこと
        assert "レベル" not in item["alert_level_name"]

    @pytest.mark.asyncio
    async def test_日本語指定では日本語のまま返る(self, client, monkeypatch):
        from app import main

        async def stub():
            return [
                main.VolcanoWarning(
                    volcano_code="503", volcano_name="阿蘇山", volcano_name_en="Asosan",
                    alert_level=3, alert_level_name="x", warning_name_ja="レベル３（入山規制）",
                    severity="high", issued_at="2026-08-20T14:00:00+09:00",
                )
            ]

        monkeypatch.setattr(main.volcano_service, "get_volcano_warnings", stub)
        monkeypatch.setattr(main.limiter, "enabled", False)
        body = (await client.get("/api/v1/volcanoes/warnings?lang=ja")).json()
        assert body[0]["volcano_name"] == "阿蘇山"
        assert body[0]["alert_level_name"] == LEVEL_NAMES[3]["ja"]

    def test_火山コードの手書きリストが残っていない(self):
        # 文字列コードと int を比べていて一度も効いていなかった
        assert not hasattr(VolcanoService, "MONITORED_VOLCANOES")
