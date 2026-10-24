"""スナップショットの震源名の多言語版（location_i18n / epicenter_i18n）。

/signage（宿のロビー）で震源名が日本語のまま出ていた。地震一覧 API（location_translated）と
同じ訳を使うため、translator の静的 2 段（手訳 82 件 → 形態からの組み立て）を共用する。
AI 翻訳は呼ばない（スナップショットは毎分作るため、費用と遅延を載せない）。

守ること:
- 訳がある言語だけキーを持つ（訳の無い言語・日本語そのままはキーを省く）
- location_ja / epicenter_ja / epicenter_en は残す（後方互換）
- 調査中（location_ja が null）は空
- 旧形式（キーが無い・schema_version 1.0）の前回ファイルも読める
"""
import json
from datetime import datetime, timezone

import pytest

from app.models import ALLOWED_LANGUAGES, EarthquakeInfo
from app.services import snapshot_service, translator as translator_module
from app.services.location_composer import compose
from app.services.location_translations import get_location_translation
from app.services.p2p_service import P2PQuakeService
from app.services.snapshot_service import (
    DATASET_NAMES,
    SnapshotBuilder,
    earthquake_item,
    location_i18n,
    tsunami_item,
)
from app.services.tsunami_service import ActiveTsunamiReport
from app.snapshot_models import DatasetStatus, Snapshot

T0 = datetime(2026, 10, 22, 0, 0, 0, tzinfo=timezone.utc)
TARGET_LANGS = sorted(ALLOWED_LANGUAGES - {"ja"})

#: 手訳 82 件に入っている名前（16 言語すべての訳がある）
STATIC_NAME = "北海道南西沖"
#: 手訳に無く、形態からの組み立てでだけ訳せる名前
COMPOSED_NAME = "滋賀県北部"
#: どの段でも訳せない名前
UNKNOWN_NAME = "存在しないほげ地名"


def _eq(location: str) -> EarthquakeInfo:
    return EarthquakeInfo(
        id="eq1", time="2026/10/21 23:41:00", location=location, magnitude=4.2,
        max_intensity="2", depth=10, latitude=42.6, longitude=142.7,
        tsunami_warning="なし", message="",
    )


def _tsunami(anm, en_anm="Off Sanriku") -> ActiveTsunamiReport:
    return ActiveTsunamiReport(
        report={"eid": "e1", "ctt": "c1", "anm": anm, "en_anm": en_anm, "mag": "7.0"},
        level="advisory",
        areas=(),
    )


class TestLocationI18n:
    def test_手訳のある名前は日本語以外の15言語すべてを持つ(self):
        result = location_i18n(STATIC_NAME)
        assert sorted(result) == TARGET_LANGS
        for lang in TARGET_LANGS:
            assert result[lang] == get_location_translation(STATIC_NAME, lang)

    def test_組み立てでだけ訳せる名前も入る(self):
        assert get_location_translation(COMPOSED_NAME, "en") is None, "前提が崩れている"
        result = location_i18n(COMPOSED_NAME)
        assert result["en"] == compose(COMPOSED_NAME, "en")
        assert result["en"] != COMPOSED_NAME

    def test_jaキーは持たない(self):
        assert "ja" not in location_i18n(STATIC_NAME)

    def test_訳せない名前は空でキーを作らない(self):
        assert location_i18n(UNKNOWN_NAME) == {}

    def test_訳の無い言語だけキーを省く(self, monkeypatch):
        original = translator_module.translate_location_static

        def without_fr(location, lang):
            return None if lang == "fr" else original(location, lang)

        monkeypatch.setattr(snapshot_service, "translate_location_static", without_fr)
        result = location_i18n(STATIC_NAME)
        assert "fr" not in result
        assert "en" in result and "de" in result

    def test_日本語のまま返る訳はキーを作らない(self, monkeypatch):
        monkeypatch.setattr(snapshot_service, "translate_location_static", lambda location, lang: location)
        assert location_i18n(STATIC_NAME) == {}

    @pytest.mark.parametrize("value", [None, ""])
    def test_空は空(self, value):
        assert location_i18n(value) == {}

    @pytest.mark.asyncio
    @pytest.mark.parametrize("name", [STATIC_NAME, COMPOSED_NAME])
    async def test_地震一覧APIのlocation_translatedと同じ訳になる(self, name):
        from app.services.translator import TranslatorService

        service = TranslatorService()
        result = location_i18n(name)
        for lang in result:
            assert result[lang] == await service.translate_location(name, lang), lang


class TestEarthquakeItem:
    def test_location_i18nが入りlocation_jaは残る(self):
        item = earthquake_item(_eq(STATIC_NAME))
        assert item.location_ja == STATIC_NAME
        assert item.location_i18n["en"] == get_location_translation(STATIC_NAME, "en")
        assert "ja" not in item.location_i18n

    def test_調査中は空(self):
        item = earthquake_item(_eq(P2PQuakeService.UNDETERMINED_LOCATION))
        assert item.location_ja is None
        assert item.location_i18n == {}

    def test_訳せない名前は空でlocation_jaは残る(self):
        item = earthquake_item(_eq(UNKNOWN_NAME))
        assert item.location_ja == UNKNOWN_NAME
        assert item.location_i18n == {}

    def test_JSONに出る(self):
        dumped = json.loads(earthquake_item(_eq(STATIC_NAME)).model_dump_json())
        assert dumped["location_ja"] == STATIC_NAME
        assert dumped["location_i18n"]["en"] == get_location_translation(STATIC_NAME, "en")


class TestTsunamiItem:
    def test_epicenter_i18nが入りjaとenは残る(self):
        item = tsunami_item(_tsunami(STATIC_NAME))
        assert item.epicenter_ja == STATIC_NAME
        assert item.epicenter_en == "Off Sanriku"
        assert item.epicenter_i18n["ko"] == get_location_translation(STATIC_NAME, "ko")

    def test_震源の無い報は空(self):
        item = tsunami_item(_tsunami(None, en_anm=None))
        assert item.epicenter_ja is None
        assert item.epicenter_i18n == {}


class TestCompatibility:
    def test_schema_versionは下位桁を上げる(self):
        from app.snapshot_models import SCHEMA_VERSION
        assert SCHEMA_VERSION == "1.1"

    @pytest.mark.asyncio
    async def test_旧形式の前回ファイルを読んでstaleで出せる(self):
        """キーの無い 1.0 のファイル（デプロイ直前の出力）を seed しても落ちない。"""
        old = {
            "schema_version": "1.0",
            "generated_at": "2026-10-21T23:59:00Z",
            "source": json.loads(snapshot_service.SOURCE.model_dump_json()),
            "datasets": {
                "earthquakes": {"status": "ok", "fetched_at": "2026-10-21T23:59:00Z", "items": [{
                    "id": "old", "occurred_at": None, "location_ja": STATIC_NAME, "magnitude": 4.0,
                    "depth_km": 10, "max_intensity": "2", "max_scale": 20, "latitude": None,
                    "longitude": None, "domestic_tsunami": "None",
                }]},
                "tsunami": {"status": "ok", "fetched_at": "2026-10-21T23:59:00Z", "items": [{
                    "event_id": "e", "report_id": "r", "report_datetime": None, "info_type": None,
                    "warning_level": "advisory", "earthquake_time": None, "epicenter_ja": STATIC_NAME,
                    "epicenter_en": None, "magnitude": None, "areas": [],
                }]},
                "volcano_warnings": {"status": "ok", "fetched_at": "2026-10-21T23:59:00Z", "items": []},
            },
        }
        previous = Snapshot.model_validate_json(json.dumps(old))

        async def fail():
            raise ValueError("boom")

        fetchers = {name: fail for name in DATASET_NAMES}
        builder = SnapshotBuilder(fetchers, clock=lambda: T0)
        builder.seed(previous)
        snap = await builder.build()
        assert snap.schema_version == "1.1"
        eqs = snap.datasets.earthquakes
        assert eqs.status == DatasetStatus.stale
        assert eqs.items[0].location_ja == STATIC_NAME
        assert eqs.items[0].location_i18n == {}
        assert snap.datasets.tsunami.items[0].epicenter_i18n == {}

    @pytest.mark.asyncio
    async def test_staleは前回成功時の訳をそのまま出す(self):
        state = {"fail": False}

        async def quakes():
            if state["fail"]:
                raise ValueError("boom")
            return [earthquake_item(_eq(STATIC_NAME))]

        async def empty():
            return []

        builder = SnapshotBuilder(
            {"earthquakes": quakes, "tsunami": empty, "volcano_warnings": empty}, clock=lambda: T0
        )
        first = await builder.build()
        state["fail"] = True
        second = await builder.build()
        assert second.datasets.earthquakes.status == DatasetStatus.stale
        assert second.datasets.earthquakes.items[0].location_i18n == first.datasets.earthquakes.items[0].location_i18n
        assert second.datasets.earthquakes.items[0].location_i18n["en"]
