"""
避難所データサービス
国土地理院の避難所データを利用（CSV/JSONからロード可能）
"""
import csv
import gzip
import hashlib
import math
import json
from typing import Optional
from pathlib import Path
from ..models import ShelterInfo
from ..utils.logger import get_logger

logger = get_logger(__name__)


class ShelterService:
    """避難所データを管理するサービス

    データソース: 国土地理院の指定緊急避難場所データ
    https://www.geospatial.jp/ckan/dataset/hinanbasho
    """

    # 同梱している全国データ（`scripts/build_shelters.py` の生成物）
    BUNDLED_FILE = "shelters.json.gz"

    # 空間索引の1セルの大きさ（度）。全国 115,674 件を線形走査すると 1 クエリ約 48ms かかり、
    # **同期関数なので await されず、その間このインスタンス上の全リクエストが止まる**。
    # SSE を張りっぱなしにする設計なので、避難所検索が配信をつまらせることになる。
    # 0.05 度（緯度で約 5.5km）のグリッドに落とすと 0.2〜7ms に収まる。
    GRID_CELL_DEG = 0.05

    # 緯度1度あたりの距離。セル範囲の見積もりに使う（厳密な距離は Haversine で出す）
    _KM_PER_DEG_LAT = 111.0

    def __init__(self):
        from ..config import settings
        self.DATA_DIR = settings.shelter_data_dir
        self._csv_path = settings.shelter_csv_path
        # 生データは軽量なタプルで持ち、**返す件数ぶんだけ** ShelterInfo を組み立てる。
        # 全件を pydantic モデルで抱えると実測 161MiB・起動 +3.15 秒で、
        # Cloud Run の 512Mi ではコールドスタートごとに際どくなる。
        self._rows: list[tuple] = []
        self._row_by_id: dict[str, int] = {}
        self._grid: dict[tuple[int, int], list[int]] = {}
        # 実データではなくサンプルで動いていることを API 利用者へ伝えるための旗。
        # これが立っているときに「あなたの近くの避難所」として出してはいけない
        self.is_sample_data: bool = True
        self.attribution: Optional[str] = None
        self._load_shelter_data()

    # 災害種別マッピング
    DISASTER_TYPES = {
        "flood": "洪水",
        "landslide": "崖崩れ、土石流及び地滑り",
        "storm_surge": "高潮",
        "earthquake": "地震",
        "tsunami": "津波",
        "fire": "大規模な火事",
        "inland_flood": "内水氾濫",
        "volcano": "火山現象",
    }


    def _load_shelter_data(self):
        """避難所データをロードする。

        優先順位は 運用者が指定した CSV > 同梱の全国データ > サンプル。

        **失敗したときに黙ってサンプルへ落ちない**ことがこの関数の要点。
        以前は、実データの CSV を指定しても列名が合わなければ全行スキップして 0 件になり、
        `if csv_shelters:` が偽になってサンプル 15 件へ無言でフォールバックしていた。
        残るのは INFO ログ 1 行だけで、**「実データに載せ替えた」と報告したあとも
        画面には数件のサンプルが出続ける**という状態が成立していた。
        避難所は誤ると取り返しがつかないので、読めなかったら起動を失敗させる。
        """
        # 1. 運用者が明示指定した CSV。**指定があるのに読めなければ起動を止める**
        if self._csv_path:
            rows = self._read_csv_rows(self._csv_path)
            if not rows:
                raise RuntimeError(
                    f"SHELTER_CSV_PATH に指定されたファイルから避難所を1件も読めませんでした: "
                    f"{self._csv_path}\n"
                    "列名が想定と違う可能性があります（配布元の列は「施設・場所名」「住所」"
                    "「緯度」「経度」）。サンプルデータで運用を続けると、実在しない避難所を"
                    "案内することになるため起動を中止します。"
                )
            self._install(rows, is_sample=False, attribution=None)
            logger.info(f"CSVから避難所データをロード: {len(rows)}件 ({self._csv_path})")
            return

        # 2. 同梱の全国データ（`scripts/build_shelters.py` の生成物）
        bundled = Path(self.DATA_DIR) / self.BUNDLED_FILE
        if bundled.exists():
            rows, attribution = self._read_bundled(bundled)
            self._install(rows, is_sample=False, attribution=attribution)
            logger.info(f"同梱の全国避難所データをロード: {len(rows)}件")
            return

        # 3. サンプル。**旗を立てて、実データでないことを API 経由で伝えられるようにする**
        sample_file = Path(self.DATA_DIR) / "sample_shelters.json"
        if sample_file.exists():
            with open(sample_file, "r", encoding="utf-8") as f:
                shelters = [ShelterInfo(**s) for s in json.load(f)]
        else:
            shelters = self._get_sample_shelters()
        self._install([self._model_to_row(s) for s in shelters], is_sample=True, attribution=None)
        logger.warning(
            f"避難所はサンプルデータで動作しています（{len(shelters)}件）。"
            f"実データを同梱するには scripts/build_shelters.py を実行してください"
        )

    def _install(self, rows: list[tuple], *, is_sample: bool, attribution: Optional[str]) -> None:
        """行データを差し替え、索引を張り直す。"""
        self._rows = rows
        self.is_sample_data = is_sample
        self.attribution = attribution
        self._row_by_id = {row[0]: i for i, row in enumerate(rows)}
        self._grid = {}
        for i, row in enumerate(rows):
            self._grid.setdefault(self._cell(row[3], row[4]), []).append(i)

    def _cell(self, lat: float, lon: float) -> tuple[int, int]:
        return (int(lat // self.GRID_CELL_DEG), int(lon // self.GRID_CELL_DEG))

    def _read_bundled(self, path: Path) -> tuple[list[tuple], Optional[str]]:
        """同梱の gzip JSON を読む。形式は scripts/build_shelters.py を参照。"""
        with gzip.open(path, "rt", encoding="utf-8") as f:
            payload = json.load(f)
        meta = payload.get("meta", {})
        bits = {
            "flood": 1 << 0, "landslide": 1 << 1, "storm_surge": 1 << 2, "earthquake": 1 << 3,
            "tsunami": 1 << 4, "fire": 1 << 5, "inland_flood": 1 << 6, "volcano": 1 << 7,
        }
        rows = [
            (sid, name, address, lat, lon, tuple(k for k, b in bits.items() if mask & b))
            for sid, name, address, lat, lon, mask in payload["shelters"]
        ]
        return rows, meta.get("attribution")

    @staticmethod
    def _model_to_row(s: ShelterInfo) -> tuple:
        return (s.id, s.name, s.address, s.latitude, s.longitude, tuple(s.types))

    @staticmethod
    def _row_to_model(row: tuple, distance: Optional[float] = None) -> ShelterInfo:
        sid, name, address, lat, lon, types = row
        return ShelterInfo(
            id=sid, name=name, address=address,
            latitude=lat, longitude=lon, types=list(types), distance=distance,
            # capacity / facilities / phone / is_open は配布データに存在しない。
            # 値を捏造せず、無いものは無いままにする
        )

    def _read_csv_rows(self, csv_path: str) -> list[tuple]:
        """CSV を読み、内部表現（タプル）にして返す。

        `_load_shelters_from_csv` は ShelterInfo を返す既存のインターフェースなので
        そのまま残し、ここで内部表現へ変換する。全国規模の CSV でも
        一時的にモデルを作るのは1回きりで、常駐はタプルだけになる。
        """
        return [self._model_to_row(s) for s in self._load_shelters_from_csv(csv_path)]

    def _load_shelters_from_csv(self, csv_path: str) -> list[ShelterInfo]:
        """
        国土地理院の指定緊急避難場所CSV形式データを読み込む

        CSV列（想定）: 施設名, 住所, 緯度, 経度, 洪水, 崖崩れ, 高潮, 地震, 津波, 火災, 内水氾濫, 火山

        Args:
            csv_path: CSVファイルのパス

        Returns:
            list[ShelterInfo]: 読み込まれた避難所リスト。ファイルが見つからない場合は空リスト。
        """
        path = Path(csv_path)
        if not path.exists():
            logger.warning(f"CSVファイルが見つかりません: {csv_path}")
            return []

        # 災害種別列とtypesキーのマッピング
        disaster_column_map = {
            "洪水": "flood",
            "崖崩れ": "landslide",
            "崖崩れ、土石流及び地滑り": "landslide",
            "高潮": "storm_surge",
            "地震": "earthquake",
            "津波": "tsunami",
            "火災": "fire",
            "大規模な火事": "fire",
            "内水氾濫": "inland_flood",
            "火山": "volcano",
            "火山現象": "volcano",
        }

        shelters: list[ShelterInfo] = []
        try:
            # 配布元の CSV は **UTF-8 BOM 付き**。"utf-8" で開くと先頭の列名が
            # "﻿NO" になり、以降の列参照が静かにずれる
            with open(path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for idx, row in enumerate(reader):
                    try:
                        # **配布元の実際の列名は「施設・場所名」。** 「施設名」だけを見ていたため
                        # 全行で name が空になり、全件スキップして 0 件になっていた。
                        # 候補を並べる形にして、どれか1つでも合えば読めるようにする
                        name = next(
                            (row[c].strip() for c in ("施設・場所名", "施設名", "名称")
                             if row.get(c) and row[c].strip()),
                            "",
                        )
                        address = next(
                            (row[c].strip() for c in ("住所", "所在地")
                             if row.get(c) and row[c].strip()),
                            "",
                        )
                        lat_str = row.get("緯度", "").strip()
                        lon_str = row.get("経度", "").strip()

                        if not name or not lat_str or not lon_str:
                            continue

                        latitude = float(lat_str)
                        longitude = float(lon_str)

                        # 災害種別を判定（値が "1", "○", "TRUE" 等なら対応）
                        types: list[str] = []
                        for col_name, type_key in disaster_column_map.items():
                            val = row.get(col_name, "").strip()
                            if val in ("1", "○", "◎", "TRUE", "true", "True", "yes", "Yes"):
                                if type_key not in types:
                                    types.append(type_key)

                        # 配布元が振る「共通ID」があればそれを使う。施設名+座標のハッシュだと
                        # 改称や測地の微修正でIDが変わり、更新のたびに別物になってしまう
                        common_id = (row.get("共通ID") or "").strip()
                        if common_id:
                            shelter_id = common_id
                        else:
                            raw_id = f"{name}_{latitude}_{longitude}"
                            shelter_id = f"csv_{hashlib.sha256(raw_id.encode()).hexdigest()[:8]}"

                        shelters.append(ShelterInfo(
                            id=shelter_id,
                            name=name,
                            address=address,
                            latitude=latitude,
                            longitude=longitude,
                            types=types,
                            # is_open は配布データに存在しない。既定の True で埋めると
                            # 「開設中」と断言することになるため設定しない
                        ))
                    except (ValueError, KeyError) as row_err:
                        logger.warning(f"CSV行 {idx + 1} の解析スキップ: {row_err}")
                        continue

            logger.info(f"CSVから{len(shelters)}件の避難所を読み込みました: {csv_path}")
        except Exception as e:
            logger.error(f"CSV読み込みエラー: {e}", exc_info=True)
            return []

        return shelters

    def _get_sample_shelters(self) -> list[ShelterInfo]:
        """サンプル避難所データ（東京都の主要避難所）"""
        return [
            ShelterInfo(
                id="tokyo_001",
                name="東京都庁",
                address="東京都新宿区西新宿2-8-1",
                latitude=35.6896,
                longitude=139.6917,
                capacity=5000,
                facilities=["バリアフリー", "駐車場"],
                types=["earthquake", "fire"],
                is_open=True,
            ),
            ShelterInfo(
                id="tokyo_002",
                name="新宿中央公園",
                address="東京都新宿区西新宿2-11",
                latitude=35.6909,
                longitude=139.6892,
                capacity=10000,
                facilities=["広域避難場所"],
                types=["earthquake", "fire"],
                is_open=True,
            ),
            ShelterInfo(
                id="tokyo_003",
                name="代々木公園",
                address="東京都渋谷区代々木神園町2-1",
                latitude=35.6715,
                longitude=139.6949,
                capacity=20000,
                facilities=["広域避難場所", "駐車場"],
                types=["earthquake", "fire"],
                is_open=True,
            ),
            ShelterInfo(
                id="tokyo_004",
                name="渋谷区役所",
                address="東京都渋谷区宇田川町1-1",
                latitude=35.6641,
                longitude=139.6979,
                capacity=2000,
                facilities=["バリアフリー"],
                types=["earthquake", "flood"],
                is_open=True,
            ),
            ShelterInfo(
                id="tokyo_005",
                name="上野公園",
                address="東京都台東区上野公園5-20",
                latitude=35.7146,
                longitude=139.7732,
                capacity=15000,
                facilities=["広域避難場所", "バリアフリー"],
                types=["earthquake", "fire"],
                is_open=True,
            ),
        ]

    def get_nearby_shelters(
        self,
        lat: float,
        lon: float,
        radius_km: float = 5.0,
        limit: int = 20,
        disaster_type: Optional[str] = None
    ) -> list[ShelterInfo]:
        """
        指定座標から近い避難所を取得

        Args:
            lat: 緯度
            lon: 経度
            radius_km: 検索半径（km）
            limit: 取得件数上限
            disaster_type: 災害種別でフィルタリング

        Returns:
            list[ShelterInfo]: 近い順にソートされた避難所リスト
        """
        # 全件を走査せず、半径が届くセルだけを見る。
        # 全国 115,674 件の線形走査は約 48ms かかり、**同期関数なので await されない**。
        # SSE を張り続ける設計では、その 48ms のあいだ同じインスタンス上の
        # 配信まで止まってしまう。
        delta_lat = radius_km / self._KM_PER_DEG_LAT
        # 経度方向は緯度によって1度あたりの距離が縮む。日本の緯度では cos が 0 に
        # 近づくことはないが、極付近を渡されてゼロ除算しないよう下限を置く
        cos_lat = max(math.cos(math.radians(lat)), 1e-6)
        delta_lon = radius_km / (self._KM_PER_DEG_LAT * cos_lat)

        cell = self.GRID_CELL_DEG
        lat_from, lat_to = self._cell(lat - delta_lat, 0)[0], self._cell(lat + delta_lat, 0)[0]
        lon_from, lon_to = self._cell(0, lon - delta_lon)[1], self._cell(0, lon + delta_lon)[1]

        results: list[tuple[float, tuple]] = []
        for gx in range(lat_from, lat_to + 1):
            for gy in range(lon_from, lon_to + 1):
                for index in self._grid.get((gx, gy), ()):
                    row = self._rows[index]
                    if disaster_type and disaster_type not in row[5]:
                        continue
                    # セルは矩形なので、円に入るかは Haversine で確かめる
                    distance = self._calculate_distance(lat, lon, row[3], row[4])
                    if distance <= radius_km:
                        results.append((distance, row))

        results.sort(key=lambda pair: pair[0])
        # **ここで初めて pydantic モデルを組む。** 返す件数ぶんだけで済むので、
        # 全件をモデルで抱える必要がない（全国分で実測 161MiB → 起動時 +3.15 秒だった）
        return [self._row_to_model(row, round(distance, 2)) for distance, row in results[:limit]]

    def _calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        2点間の距離を計算（Haversine公式）

        Args:
            lat1, lon1: 地点1の緯度経度
            lat2, lon2: 地点2の緯度経度

        Returns:
            float: 距離（km）
        """
        R = 6371  # 地球の半径（km）

        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)

        a = math.sin(delta_lat / 2) ** 2 + \
            math.cos(lat1_rad) * math.cos(lat2_rad) * \
            math.sin(delta_lon / 2) ** 2

        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    def get_all_shelters(self, limit: int = 100) -> list[ShelterInfo]:
        """
        全ての避難所を取得

        Args:
            limit: 取得件数上限

        Returns:
            list[ShelterInfo]: 避難所リスト
        """
        return [self._row_to_model(row) for row in self._rows[:limit]]

    def get_shelters_by_type(self, disaster_type: str, limit: int = 50) -> list[ShelterInfo]:
        """
        災害種別で避難所を取得

        Args:
            disaster_type: 災害種別（earthquake, tsunami, flood等）
            limit: 取得件数上限

        Returns:
            list[ShelterInfo]: 該当する避難所リスト
        """
        matched = (row for row in self._rows if disaster_type in row[5])
        return [self._row_to_model(row) for _, row in zip(range(limit), matched)]

    def get_shelter_by_id(self, shelter_id: str) -> Optional[ShelterInfo]:
        """
        IDで避難所を取得

        Args:
            shelter_id: 避難所ID

        Returns:
            ShelterInfo: 避難所情報
        """
        index = self._row_by_id.get(shelter_id)
        return None if index is None else self._row_to_model(self._rows[index])

    async def fetch_and_update_shelter_data(self) -> bool:
        """
        避難所データを再読み込みして更新する

        設定されたCSVパスまたはJSONファイルからデータをリロードします。
        CSVパスが設定されていない場合はJSON/サンプルデータにフォールバックします。

        Returns:
            bool: 成功時True
        """
        logger.info("避難所データの更新を開始します...")
        previous_count = len(self._rows)

        try:
            # CSVパスを設定から再取得（動的変更に対応）
            from ..config import settings
            self._csv_path = settings.shelter_csv_path

            # データを再ロード
            self._load_shelter_data()

            current_count = len(self._rows)
            logger.info(
                f"避難所データ更新完了: {previous_count}件 -> {current_count}件"
            )
            return True
        except Exception as e:
            logger.error(f"避難所データ更新エラー: {e}", exc_info=True)
            return False

    def get_disaster_types(self) -> dict[str, str]:
        """
        対応している災害種別一覧を取得

        Returns:
            dict: 災害種別コードと日本語名のマッピング
        """
        return self.DISASTER_TYPES
