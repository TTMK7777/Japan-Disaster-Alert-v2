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

from app.services.area_names import AREA_NAMES, FORECAST_OFFICE_CODES
from app.utils.area_codes import AREA_CODES

#: アプリから到達できていない予報区。ここを減らすのが今後の課題。
#: 件数を固定しておき、**気付かないうちに増えたら落ちる**ようにする。
#: 内訳: 北海道7（宗谷・上川留萌・網走北見紋別・十勝・釧路根室・胆振日高・渡島檜山）、
#:       鹿児島1（奄美）、沖縄3（大東島・宮古島・八重山）
KNOWN_UNREACHABLE_COUNT = 11


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


class TestUnreachableForecastOffices:
    """未対応の予報区を明示的に記録する（黙って増えないように）"""

    def test_未到達の予報区の件数が想定どおり(self):
        unreachable = FORECAST_OFFICE_CODES - set(AREA_CODES.values())
        assert len(unreachable) == KNOWN_UNREACHABLE_COUNT, (
            "アプリから到達できない予報区の数が変わった。"
            f"現在: {sorted((c, AREA_NAMES[c]['ja']) for c in unreachable)}"
        )

    def test_主要な観光地の未対応を記録する(self):
        """宮古島・八重山（石垣島）は主要な観光地だが、沖縄県=本島のため未対応。

        対応したらこのテストを消すこと。**未対応であることの記録**であって、
        未対応を正当化するものではない。
        """
        unreachable = FORECAST_OFFICE_CODES - set(AREA_CODES.values())
        assert "473000" in unreachable  # 宮古島地方
        assert "474000" in unreachable  # 八重山地方
