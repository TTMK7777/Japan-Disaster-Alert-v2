"""震源地が未確定の段階（震度速報 / ScalePrompt）の扱い。

実データで観測した形（2026-08-25、直近 317 レポートを実測）:

| 地名 | M | 深さ | 震度 | issue.type   | 件数 |
|------|---|------|------|--------------|------|
| あり | ○ | ○    | ○    | DetailScale  | 247  |
| 空   | × | ×    | ○    | ScalePrompt  |  38  |
| あり | ○ | ○    | ×    | Destination  |  30  |
| あり | ○ | ×    | ×    | Foreign      |   1  |

震度速報の hypocenter は **キーが存在したうえで空文字・-1 が入る**:

    {"depth": -1, "latitude": -200, "longitude": -200, "magnitude": -1, "name": ""}

したがって `hypocenter.get("name", "不明")` は既定値に落ちず `""` を返す。
これが画面では**高さ 0px の空の見出し**になっていた（実ブラウザで確認）。
数値欄の -1 と同じ「番兵値であって欠損ではない」型の誤り。
"""
import pytest

from app.services.p2p_service import P2PQuakeService
from app.services.translator import TranslatorService


def _scale_prompt(time: str = "2026/08/25 09:00:00", max_scale: int = 30) -> dict:
    """震度速報の生データ。実 API のレスポンスをそのまま写している。"""
    return {
        "id": "sp-1",
        "earthquake": {
            "time": time,
            "maxScale": max_scale,
            "domesticTsunami": "Checking",
            "hypocenter": {
                "name": "",
                "magnitude": -1,
                "depth": -1,
                "latitude": -200,
                "longitude": -200,
            },
        },
    }


def _detail(time: str = "2026/08/25 09:00:00", name: str = "宮古島近海") -> dict:
    return {
        "id": "ds-1",
        "earthquake": {
            "time": time,
            "maxScale": 30,
            "domesticTsunami": "None",
            "hypocenter": {
                "name": name,
                "magnitude": 4.2,
                "depth": 30,
                "latitude": 24.8,
                "longitude": 125.3,
            },
        },
    }


@pytest.fixture
def service() -> P2PQuakeService:
    return P2PQuakeService()


class TestLocationNeverEmpty:
    def test_空文字の震源地名が空のまま通らない(self, service):
        eq = service._parse_earthquake(_scale_prompt())
        assert eq is not None
        assert eq.location != ""
        assert eq.location.strip() != ""

    def test_空白だけの震源地名も空扱いにする(self, service):
        data = _scale_prompt()
        data["earthquake"]["hypocenter"]["name"] = "   "
        eq = service._parse_earthquake(data)
        assert eq.location.strip() != ""

    def test_キー自体が無い場合も空にならない(self, service):
        data = _scale_prompt()
        del data["earthquake"]["hypocenter"]["name"]
        eq = service._parse_earthquake(data)
        assert eq.location.strip() != ""

    def test_未確定は不明ではなく調査中として表す(self, service):
        # 震度速報の震源地は「分からない」のではなく「まだ決まっていない」。
        # 数分後の続報で確定するので、恒久的な欠損を意味する語を使わない
        eq = service._parse_earthquake(_scale_prompt())
        assert eq.location == service.UNDETERMINED_LOCATION
        assert "調査中" in eq.location

    def test_実在する震源地名はそのまま通す(self, service):
        eq = service._parse_earthquake(_detail())
        assert eq.location == "宮古島近海"


class TestCompletenessAndDedup:
    def test_未確定の震源地は情報量として数えない(self, service):
        pending = service._parse_earthquake(_scale_prompt())
        known = service._parse_earthquake(_detail())
        assert service._completeness(pending) < service._completeness(known)

    def test_同じ地震では震源地が確定したレポートを残す(self, service):
        # 震度速報が先に届き、あとから詳細が来る並び
        reports = [_scale_prompt(), _detail()]
        parsed = [service._parse_earthquake(r) for r in reports]
        result = service._deduplicate(parsed)
        assert len(result) == 1
        assert result[0].location == "宮古島近海"

    def test_順序が逆でも確定したレポートが勝つ(self, service):
        parsed = [service._parse_earthquake(_detail()), service._parse_earthquake(_scale_prompt())]
        result = service._deduplicate(parsed)
        assert len(result) == 1
        assert result[0].location == "宮古島近海"


class TestJapaneseMessage:
    def test_震源地が未確定でも文が壊れない(self, service):
        eq = service._parse_earthquake(_scale_prompt())
        # 「【地震情報】で地震がありました。」のような助詞だけが残る文にしない
        assert "】で地震" not in eq.message
        assert "調査中" in eq.message

    def test_未確定の数値を文に出さない(self, service):
        eq = service._parse_earthquake(_scale_prompt())
        assert "-1" not in eq.message


class TestTranslatedMessage:
    """多言語メッセージ。日本語版だけ直しても利用者の 15 言語には届かない。"""

    LANGS = ["en", "zh", "zh-TW", "ko", "vi", "th", "id", "ms", "tl", "fr", "de", "it", "es", "ne", "easy_ja"]

    @pytest.fixture
    def translator(self) -> TranslatorService:
        return TranslatorService()

    @pytest.mark.parametrize("lang", LANGS)
    def test_規模未確定のとき_マイナス1を出さない(self, translator, lang):
        msg = translator.generate_earthquake_message(
            lang=lang,
            location="Off the coast of Fukushima Prefecture",
            magnitude=-1,
            intensity="3",
            depth=-1,
            tsunami_warning="調査中",
            tsunami_warning_translated="Checking",
        )
        assert "-1" not in msg, f"{lang}: 未確定の番兵値が文面に出ている: {msg}"

    @pytest.mark.parametrize("lang", LANGS)
    def test_深さだけ未確定のときも_マイナス1を出さない(self, translator, lang):
        # 実データの Foreign レポートがこの組み合わせ
        msg = translator.generate_earthquake_message(
            lang=lang,
            location="Colombia",
            magnitude=5.4,
            intensity="不明",
            depth=-1,
            tsunami_warning="なし",
            tsunami_warning_translated="None",
        )
        assert "-1" not in msg, f"{lang}: {msg}"

    @pytest.mark.parametrize("lang", LANGS)
    def test_すべて揃っていれば数値が入る(self, translator, lang):
        msg = translator.generate_earthquake_message(
            lang=lang,
            location="Near Miyakojima",
            magnitude=4.2,
            intensity="3",
            depth=30,
            tsunami_warning="なし",
            tsunami_warning_translated="None",
        )
        # easy_ja は「マグニチュード」という概念自体を出さない方針なので対象外。
        # やさしい日本語で必要なのは揺れの強さで、規模の数値ではない
        if lang != "easy_ja":
            assert "4.2" in msg, f"{lang}: マグニチュードが落ちている: {msg}"
        assert "30" in msg, f"{lang}: 深さが落ちている: {msg}"

    def test_easy_ja_は規模を出さない方針を固定する(self, translator):
        msg = translator.generate_earthquake_message(
            lang="easy_ja", location="みやこじま", magnitude=4.2, intensity="しんど 3",
            depth=30, tsunami_warning="なし", tsunami_warning_translated="なし",
        )
        assert "4.2" not in msg
        assert "しんど 3" in msg

    def test_震源地が未確定のとき地名を文に入れない(self, translator):
        for lang in self.LANGS:
            msg = translator.generate_earthquake_message(
                lang=lang, location="", magnitude=-1, intensity="3",
                depth=-1, tsunami_warning="調査中", tsunami_warning_translated="Checking",
                location_pending=True,
            )
            assert msg.strip(), f"{lang}: 空のメッセージ"
            assert "-1" not in msg, f"{lang}: {msg}"


class TestUndeterminedLocationIsTranslated:
    def test_調査中の表現が15言語で用意されている(self):
        from app.services.location_translations import LOCATION_TRANSLATIONS

        key = P2PQuakeService.UNDETERMINED_LOCATION
        assert key in LOCATION_TRANSLATIONS, "未確定の震源地名が静的辞書に無い"
        entry = LOCATION_TRANSLATIONS[key]
        for lang in ["en", "zh", "zh-TW", "ko", "vi", "th", "id", "ms", "tl", "fr", "de", "it", "es", "ne", "easy_ja"]:
            assert entry.get(lang), f"{lang} の訳が無い"

    @pytest.mark.asyncio
    async def test_翻訳経路が日本語のまま返さない(self):
        translator = TranslatorService()
        result = await translator.translate_location(P2PQuakeService.UNDETERMINED_LOCATION, "en")
        assert result != P2PQuakeService.UNDETERMINED_LOCATION
        assert not any("一" <= c <= "鿿" for c in result), f"英語に漢字が残っている: {result}"


class TestSentinelConsistency:
    def test_番兵値が取得層と翻訳層で一致している(self):
        """translator は循環 import を避けるため -1 を持ち直している。

        値がずれると、翻訳層だけが未確定を検出できなくなり
        「Magnitude -1」が 15 言語に戻る。ここで固定する。
        """
        from app.services import translator as translator_module

        assert translator_module.UNDETERMINED == P2PQuakeService.UNDETERMINED


class TestCompletenessLocationTerm:
    """地名の項だけを単独で検証する。

    震度速報は規模も深さも欠けるため、実データの組み合わせでは他の項の差で
    勝敗が決まってしまい、地名の項を戻しても総合順位は変わらない
    （ミューテーションで実際に生き残った）。ここでは地名以外を揃えて、
    地名の項そのものが効いているかを見る。
    """

    def _eq(self, location: str):
        from app.models import EarthquakeInfo

        return EarthquakeInfo(
            id="x", time="2026/08/25 09:00:00", location=location,
            magnitude=4.2, max_intensity="3", depth=30,
            latitude=35.0, longitude=139.0,
            tsunami_warning="なし", message="",
        )

    def test_調査中は実在する地名より低い(self, service):
        pending = self._eq(P2PQuakeService.UNDETERMINED_LOCATION)
        known = self._eq("宮古島近海")
        assert service._completeness(pending) == service._completeness(known) - 1

    def test_不明も実在する地名より低い(self, service):
        assert service._completeness(self._eq("不明")) == service._completeness(self._eq("宮古島近海")) - 1

    def test_空文字も加点しない(self, service):
        assert service._completeness(self._eq("")) < service._completeness(self._eq("宮古島近海"))

    def test_他が同条件なら地名が確定した方を残す(self, service):
        pending = self._eq(P2PQuakeService.UNDETERMINED_LOCATION)
        known = self._eq("宮古島近海")
        assert service._deduplicate([pending, known])[0].location == "宮古島近海"


class TestUntrustedInputBounds:
    """P2P API は信頼できない外部入力。異常値が下流へ無制限に伝播しないこと。"""

    def test_異常に長い震源地名は上限で切られる(self, service):
        data = _scale_prompt()
        data["earthquake"]["hypocenter"]["name"] = "あ" * 10_000
        eq = service._parse_earthquake(data)
        assert eq is not None
        assert len(eq.location) <= P2PQuakeService.MAX_LOCATION_LENGTH
        # message は location から組み立てるので、これも有界になる
        assert len(eq.message) <= P2PQuakeService.MAX_LOCATION_LENGTH + 200

    def test_実在する最長級の震源地名は切られない(self, service):
        data = _detail(name="熊本県天草・芦北地方")
        eq = service._parse_earthquake(data)
        assert eq.location == "熊本県天草・芦北地方"

    @pytest.mark.asyncio
    async def test_壊れたJSONで500にならず空リストへ落ちる(self, service, monkeypatch):
        """200 のまま壊れた本文（切断・プロキシ改変等）が返っても
        docstring の約束どおり空リストへグレースフルデグレードすること。
        json.JSONDecodeError は httpx.HTTPError の子ではないので、
        except を広げていないと素通りして 500 になる。
        """
        import json as json_module

        class _BrokenResponse:
            def raise_for_status(self):
                return None

            def json(self):
                raise json_module.JSONDecodeError("Expecting value", "<html>", 0)

        class _Client:
            async def get(self, url, params=None, timeout=None):
                return _BrokenResponse()

        monkeypatch.setattr(service, "_get_client", lambda: _Client())
        result = await service.get_recent_earthquakes(limit=10)
        assert result == []
