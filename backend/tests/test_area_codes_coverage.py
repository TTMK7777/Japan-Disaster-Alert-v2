"""都道府県コード表が気象庁の実在する予報区を指していることの回帰テスト

## 背景（2026-08-01）

`AREA_CODES["鹿児島県"]` が `"460000"` になっていたが、**このコードは気象庁に存在しない**。
`/bosai/warning/data/warning/460000.json` は 404 を返し、`get_warnings` は
`httpx.HTTPError` を握って `[]` を返すため、**鹿児島県を選んだ利用者には
警報が常に 1 件も表示されない**状態だった。エラーも出ないので気付けない。

原因は「1 都道府県 = 1 予報区」という誤った前提。気象庁の府県予報区は 58 件あり、
北海道は 7、沖縄は 4、鹿児島は 2 に分かれている。
"""
import pytest

from app.services.area_display import all_forecast_offices, expand_to_offices
from app.services.area_names import AREA_NAMES, FORECAST_OFFICE_CODES
from app.utils.area_codes import AREA_CODES

def _reachable_offices() -> set[str]:
    """アプリの都道府県選択から実際に取得される予報区の集合。

    `AREA_CODES` は「1 都道府県 = 1 コード」だが、`expand_to_offices` が
    その都道府県の予報区すべてに広げるので、到達性はこちらで測る必要がある。
    表の値だけを見ると 47 件しか数えられず、実態を測れない。
    """
    reachable: set[str] = set()
    for code in AREA_CODES.values():
        reachable.update(expand_to_offices(code))
    return reachable


class TestAllPrefectureCodesAreReal:
    """全都道府県のコードが実在する予報区であること"""

    @pytest.mark.parametrize("prefecture,code", sorted(AREA_CODES.items()))
    def test_実在する府県予報区を指している(self, prefecture, code):
        """**これが本件の再現テスト。** 修正前は鹿児島県だけが落ちる。

        予報区でないコード（一次細分区域など）を指すと警報 API が 404 を返し、
        その都道府県は永久に警報ゼロになる。
        """
        assert code in FORECAST_OFFICE_CODES, (
            f"{prefecture} の {code} は気象庁の府県予報区ではない。"
            f"警報 API が 404 を返し、警報が常にゼロ件になる"
        )

    def test_47都道府県すべて登録されている(self):
        assert len(AREA_CODES) == 47

    def test_コードの重複が無い(self):
        codes = list(AREA_CODES.values())
        assert len(codes) == len(set(codes))

    def test_鹿児島県が実在するコードを指す(self):
        """404 を返していた 460000 に戻したら落ちる。"""
        assert AREA_CODES["鹿児島県"] != "460000"
        assert AREA_CODES["鹿児島県"] in FORECAST_OFFICE_CODES


class TestAllForecastOfficesAreReachable:
    """府県予報区 58 件すべてに到達できること

    「1 都道府県 = 1 予報区」ではないため、代表コードだけを見ていた頃は
    北海道7・奄美・大東島・宮古島・八重山の計11予報区に到達できなかった。
    """

    @pytest.mark.parametrize("code", sorted(FORECAST_OFFICE_CODES))
    def test_全ての予報区が都道府県選択から到達できる(self, code):
        """**これが再現テスト。** 代表コードだけに戻すと 11 件落ちる。"""
        assert code in _reachable_offices(), (
            f"{code}（{AREA_NAMES[code]['ja']}）に到達できない。"
            "この地域の警報は利用者に一切表示されない"
        )

    def test_主要な観光地に到達できる(self):
        """宮古島・八重山（石垣島）は主要な観光地。"""
        reachable = _reachable_offices()
        assert "473000" in reachable, "宮古島地方"
        assert "474000" in reachable, "八重山地方"

    def test_全国スキャンが全予報区を回る(self):
        """特別警報の検出（＝Push通知の元）が取りこぼさないこと。"""
        assert set(all_forecast_offices()) == set(FORECAST_OFFICE_CODES)


class TestExpandToOffices:
    def test_複数予報区の県は全予報区に広がる(self):
        assert len(expand_to_offices(AREA_CODES["北海道"])) == 8
        assert len(expand_to_offices(AREA_CODES["沖縄県"])) == 4
        assert len(expand_to_offices(AREA_CODES["鹿児島県"])) == 2

    def test_単一予報区の県はそのまま1件(self):
        assert expand_to_offices("130000") == ("130000",)

    def test_一次細分区域は広がらない(self):
        """細分区域コード（130010=東京地方）を都道府県扱いしない。"""
        assert expand_to_offices("130010") == ("130010",)

    def test_未知のコードはそのまま返す(self):
        assert expand_to_offices("999999") == ("999999",)

    @pytest.mark.parametrize("prefecture,code", sorted(AREA_CODES.items()))
    def test_広げた先は全て実在する予報区(self, prefecture, code):
        for office in expand_to_offices(code):
            assert office in FORECAST_OFFICE_CODES, f"{prefecture} → {office} は予報区でない"
