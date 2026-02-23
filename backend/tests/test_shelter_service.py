"""
ShelterService のユニットテスト
"""
import csv
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from app.models import ShelterInfo


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _write_csv(path: Path, rows: list[dict], fieldnames: list[str] | None = None):
    """テスト用CSVを書き出す"""
    if fieldnames is None:
        fieldnames = list(rows[0].keys())
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _make_service(tmp_path: Path, csv_path: str = "", csv_rows: list[dict] | None = None):
    """テスト用 ShelterService を構築する

    ShelterService.__init__ は内部で from ..config import settings を行うため、
    app.config.settings をパッチする。
    """
    data_dir = tmp_path / "shelters"
    data_dir.mkdir(parents=True, exist_ok=True)

    # CSV ファイルを作成
    actual_csv_path = csv_path
    if csv_rows is not None:
        csv_file = tmp_path / "shelters.csv"
        _write_csv(csv_file, csv_rows)
        actual_csv_path = str(csv_file)

    mock_settings = MagicMock()
    mock_settings.shelter_data_dir = str(data_dir)
    mock_settings.shelter_csv_path = actual_csv_path

    with patch("app.config.settings", mock_settings):
        from app.services.shelter_service import ShelterService
        return ShelterService()


# ---------------------------------------------------------------------------
# CSV 読み込み
# ---------------------------------------------------------------------------

def test_load_shelters_from_csv(tmp_path):
    """正常なCSVから避難所が読み込まれる"""
    rows = [
        {
            "施設名": "テスト避難所A",
            "住所": "東京都千代田区1-1",
            "緯度": "35.6812",
            "経度": "139.7671",
            "地震": "1",
            "津波": "0",
        },
        {
            "施設名": "テスト避難所B",
            "住所": "東京都港区2-2",
            "緯度": "35.6585",
            "経度": "139.7454",
            "地震": "1",
            "津波": "1",
        },
    ]
    service = _make_service(tmp_path, csv_rows=rows)
    shelters = service.get_all_shelters()
    assert len(shelters) == 2
    assert shelters[0].name == "テスト避難所A"
    assert shelters[1].name == "テスト避難所B"


def test_load_shelters_from_csv_missing_file(tmp_path):
    """CSVファイルが存在しない場合にサンプルデータへフォールバック"""
    service = _make_service(tmp_path, csv_path="/nonexistent/path.csv")
    shelters = service.get_all_shelters()
    # サンプルデータ（ハードコード）にフォールバック
    assert len(shelters) > 0
    assert shelters[0].name == "東京都庁"


def test_load_shelters_from_csv_invalid_row(tmp_path):
    """不正行（緯度なし）がスキップされる"""
    rows = [
        {
            "施設名": "正常避難所",
            "住所": "東京都新宿区",
            "緯度": "35.6896",
            "経度": "139.6917",
            "地震": "1",
        },
        {
            "施設名": "不正避難所",
            "住所": "東京都渋谷区",
            "緯度": "",        # 緯度なし → スキップ
            "経度": "139.7000",
            "地震": "1",
        },
    ]
    service = _make_service(tmp_path, csv_rows=rows)
    shelters = service.get_all_shelters()
    assert len(shelters) == 1
    assert shelters[0].name == "正常避難所"


# ---------------------------------------------------------------------------
# get_nearby_shelters
# ---------------------------------------------------------------------------

def test_get_nearby_shelters(tmp_path):
    """近隣避難所が距離順にソートされて返る"""
    rows = [
        {
            "施設名": "近い避難所",
            "住所": "東京都新宿区",
            "緯度": "35.6900",
            "経度": "139.6920",
            "地震": "1",
        },
        {
            "施設名": "遠い避難所",
            "住所": "東京都八王子市",
            "緯度": "35.6600",
            "経度": "139.3200",
            "地震": "1",
        },
    ]
    service = _make_service(tmp_path, csv_rows=rows)

    # 新宿区付近から検索（半径50kmに広げて両方含める）
    nearby = service.get_nearby_shelters(lat=35.6896, lon=139.6917, radius_km=50.0)
    assert len(nearby) == 2
    # 近い順にソートされている
    assert nearby[0].name == "近い避難所"
    assert nearby[1].name == "遠い避難所"
    # 距離が設定されている
    assert nearby[0].distance is not None
    assert nearby[0].distance < nearby[1].distance


# ---------------------------------------------------------------------------
# サンプルデータフォールバック
# ---------------------------------------------------------------------------

def test_get_sample_shelters_fallback(tmp_path):
    """CSV/JSONがない場合にハードコードサンプルが返る"""
    service = _make_service(tmp_path, csv_path="")
    shelters = service.get_all_shelters()
    assert len(shelters) == 5
    names = [s.name for s in shelters]
    assert "東京都庁" in names
    assert "代々木公園" in names
