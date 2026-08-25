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
    """CSVパスを指定したのに読めなければ**起動を失敗させる**。

    以前はここでサンプルデータへフォールバックしていたが、それは
    「運用者が実データを設定したつもりなのに、利用者には東京の5件が
    『あなたの近くの避難所』として出続ける」という状態を許す挙動だった。
    しかも残るログは警告1行だけで、画面からは見分けがつかない。

    避難所の誤案内は取り返しがつかないため、**サンプルで動き続けるより
    起動しない方が安全**という判断に変えている。
    （パスを設定していない場合のサンプル動作は下のテストで担保する）
    """
    with pytest.raises(RuntimeError, match="1件も読めませんでした"):
        _make_service(tmp_path, csv_path="/nonexistent/path.csv")


def test_サンプル利用時はフラグで判別できる(tmp_path):
    """CSVパス未設定ならサンプルで動く（開発用）。ただし旗を立てる。

    API 側がこの旗を見て「これはサンプルです」と利用者に伝えられなければ、
    サンプルが実データのふりをして表示される。
    """
    service = _make_service(tmp_path, csv_path="")
    assert service.is_sample_data is True
    assert len(service.get_all_shelters()) > 0


def test_実データ読み込み時はサンプル旗が下りる(tmp_path):
    service = _make_service(tmp_path, csv_rows=[
        {"施設・場所名": "実データ避難所", "住所": "東京都新宿区", "緯度": "35.6812",
         "経度": "139.7671", "地震": "1"},
    ])
    assert service.is_sample_data is False


def test_配布元の列名で読める(tmp_path):
    """**実データの列は「施設・場所名」**。「施設名」だけを見ていたため
    全行スキップで0件になり、無言でサンプルへ落ちていた事象の回帰テスト。"""
    service = _make_service(tmp_path, csv_rows=[
        {"共通ID": "13113-0001", "施設・場所名": "渋谷区立神宮前小学校",
         "住所": "東京都渋谷区神宮前4-20-1", "緯度": "35.6687", "経度": "139.7052",
         "地震": "1", "大規模な火事": "1"},
    ])
    shelters = service.get_all_shelters()
    assert len(shelters) == 1
    assert shelters[0].name == "渋谷区立神宮前小学校"
    assert set(shelters[0].types) == {"earthquake", "fire"}
    # 共通IDがあればハッシュではなくそれを使う（更新をまたいでIDが安定する）
    assert shelters[0].id == "13113-0001"


def test_開設状況を捏造しない(tmp_path):
    """配布データに開設状況は無い。既定値 True で「開設中」と断言してはいけない。"""
    service = _make_service(tmp_path, csv_rows=[
        {"施設・場所名": "テスト避難所", "住所": "東京都", "緯度": "35.6", "経度": "139.7",
         "地震": "1"},
    ])
    assert service.get_all_shelters()[0].is_open is None


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


class TestBundledRoundTrip:
    """生成スクリプトが作った gzip を、本番の同梱読取経路で読めること。

    レビュー指摘: `_read_bundled`（本番で実際に使われる経路）を通すテストが
    1 本も無く、生成側と読取側でビットマスク表がずれても検知できなかった。
    表は app/services/shelter_types.py に一本化したが、
    **焼き込み済みデータとの往復**はここで固定する。
    """

    @staticmethod
    def _build_gz(tmp_path):
        import csv
        import gzip
        import importlib.util
        import json
        import sys
        from pathlib import Path

        scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
        spec = importlib.util.spec_from_file_location(
            "build_shelters", scripts_dir / "build_shelters.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        csv_path = tmp_path / "sample.csv"
        with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "共通ID", "施設・場所名", "住所", "緯度", "経度",
                "洪水", "崖崩れ、土石流及び地滑り", "高潮", "地震",
                "津波", "大規模な火事", "内水氾濫", "火山現象",
            ])
            writer.writeheader()
            writer.writerow({
                "共通ID": "13104-0001", "施設・場所名": "テスト小学校",
                "住所": "東京都新宿区1-1", "緯度": "35.69", "経度": "139.70",
                "地震": "○", "津波": "", "洪水": "1", "大規模な火事": "○",
            })
            writer.writerow({
                "共通ID": "13104-0002", "施設・場所名": "テスト公園",
                "住所": "東京都新宿区2-2", "緯度": "35.70", "経度": "139.71",
                "火山現象": "○",
            })

        payload = module.build(csv_path)
        gz_path = tmp_path / "shelters.json.gz"
        with gzip.open(gz_path, "wt", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        return gz_path

    @staticmethod
    def _service_with_bundled(tmp_path, monkeypatch, gz_path):
        """同梱データ経路で ShelterService を構築する（既存 _make_service の流儀に合わせる）。"""
        from app.services.shelter_service import ShelterService

        monkeypatch.setattr(ShelterService, "BUNDLED_FILE", gz_path)
        mock_settings = MagicMock()
        mock_settings.shelter_data_dir = str(tmp_path / "shelters")
        mock_settings.shelter_csv_path = ""
        with patch("app.config.settings", mock_settings):
            return ShelterService()

    def test_生成した同梱データを本番経路で読める(self, tmp_path, monkeypatch):
        gz_path = self._build_gz(tmp_path)
        service = self._service_with_bundled(tmp_path, monkeypatch, gz_path)
        assert service.is_sample_data is False
        shelters = service.get_nearby_shelters(35.69, 139.70, radius_km=5, limit=10)
        assert len(shelters) == 2

        by_id = {s.id: s for s in shelters}
        school = by_id["13104-0001"]
        # ビットマスク → 文字列種別の対応がずれていないこと（順不同で比較）
        assert set(school.types) == {"earthquake", "flood", "fire"}
        park = by_id["13104-0002"]
        assert set(park.types) == {"volcano"}

    def test_開設状況は生成データに存在しないのでNoneのまま(self, tmp_path, monkeypatch):
        gz_path = self._build_gz(tmp_path)
        service = self._service_with_bundled(tmp_path, monkeypatch, gz_path)
        shelters = service.get_nearby_shelters(35.69, 139.70, radius_km=5, limit=10)
        assert all(s.is_open is None for s in shelters)


class TestBitAssignmentIsFrozen:
    def test_ビット割当は焼き込み済みデータとの契約なので変更不可(self):
        """DISASTER_BITS は data/shelters/shelters.json.gz に**焼き込み済み**の配線形式。

        表は shelter_types.py に一本化したので「生成側と読取側の不一致」は
        構造的に起きなくなったが、その代わり**表自体を並べ替えると**、
        ラウンドトリップテストは自己整合で緑のまま、本番の同梱データだけが
        誤読される（115,674 件の対応災害種別がサイレントに誤表示）。
        ビット値そのものをリテラルで固定して、並べ替え・挿入を検知する。
        値を変えたいときは同梱データの再生成とセットで行うこと。
        """
        from app.services.shelter_types import DISASTER_BITS

        assert DISASTER_BITS == {
            "flood": 1,
            "landslide": 2,
            "storm_surge": 4,
            "earthquake": 8,
            "tsunami": 16,
            "fire": 32,
            "inland_flood": 64,
            "volcano": 128,
        }
