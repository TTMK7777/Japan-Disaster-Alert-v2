"""特別警報の帯（フロント全タブ共通）が頼る /api/v1/alerts の契約を固定する。

フロントの `lib/specialWarning.ts` は応答の `severity == "extreme"` だけで帯を出す。
「出ているか」（気象庁 JSON の status）は backend の `_parse_warnings` が決めるので、
ここが崩れるとフロントのテストは緑のまま帯が出なくなる（または解除後も出続ける）。

- 気象庁は最初の報だけ status="発表"、以降は "継続"。**継続中の特別警報も出す**
- "解除" と "発表警報・注意報はなし" は返さない
- 特別警報は気象庁コード 32/33/35/36/37/38。警報・注意報は extreme にしない

payload は実レスポンスの形（`areas[]` は code と warnings だけ・name は無い）に合わせる。
"""
import pytest

from app.services.warning_service import WarningService

SPECIAL_CODES = ("32", "33", "35", "36", "37", "38")


def _payload(*warnings: tuple[str, str], area_id: str = "130010") -> dict:
    return {
        "reportDatetime": "2026-10-22T05:00:00+09:00",
        "areaTypes": [
            {
                "areas": [
                    {
                        "code": area_id,
                        "warnings": [{"code": code, "status": status} for code, status in warnings],
                    }
                ]
            }
        ],
    }


@pytest.fixture
def service() -> WarningService:
    return WarningService()


def _extreme(service: WarningService, payload: dict) -> list:
    return [a for a in service._parse_warnings(payload, "130000", "en") if a.severity == "extreme"]


@pytest.mark.parametrize("code", SPECIAL_CODES)
@pytest.mark.parametrize("status", ["発表", "継続"])
def test_発表中と継続中の特別警報は_extreme_で返る(service, code, status):
    alerts = _extreme(service, _payload((code, status)))
    assert len(alerts) == 1
    assert alerts[0].is_continuing is (status == "継続")


@pytest.mark.parametrize("code", SPECIAL_CODES)
@pytest.mark.parametrize("status", ["解除", "発表警報・注意報はなし"])
def test_解除された特別警報は返らない(service, code, status):
    assert _extreme(service, _payload((code, status))) == []


@pytest.mark.parametrize("code", ["03", "05", "10", "14", "20"])
def test_警報と注意報は_extreme_にならない(service, code):
    alerts = service._parse_warnings(_payload((code, "発表")), "130000", "en")
    assert alerts, "警報・注意報そのものは出る"
    assert all(a.severity != "extreme" for a in alerts)
