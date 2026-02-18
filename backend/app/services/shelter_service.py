"""
避難所データサービス
国土地理院の避難所データを利用
"""
import httpx
import math
import json
from typing import Optional
from pathlib import Path
from ..models import ShelterInfo
from ..utils.logger import get_logger

logger = get_logger(__name__)


class ShelterService:
    """避難所データを管理するサービス"""

    # 国土地理院の避難所データURL
    GSI_SHELTER_URL = "https://www.geospatial.jp/ckan/dataset/hinanbasho"

    def __init__(self):
        from ..config import settings
        self.DATA_DIR = settings.shelter_data_dir
        self._shelters_cache: list[ShelterInfo] = []
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
        """避難所データをロード"""
        try:
            # サンプルデータをロード（実際のデータに置き換え可能）
            sample_file = Path(self.DATA_DIR) / "sample_shelters.json"
            if sample_file.exists():
                with open(sample_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._shelters_cache = [ShelterInfo(**s) for s in data]
            else:
                # デフォルトのサンプルデータ
                self._shelters_cache = self._get_sample_shelters()
        except Exception as e:
            logger.error(f"避難所データロードエラー: {e}", exc_info=True)
            self._shelters_cache = self._get_sample_shelters()

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
        shelters_with_distance = []

        for shelter in self._shelters_cache:
            # 距離計算（Haversine公式）
            distance = self._calculate_distance(lat, lon, shelter.latitude, shelter.longitude)

            if distance <= radius_km:
                # 災害種別フィルタリング
                if disaster_type and disaster_type not in shelter.types:
                    continue

                shelter_copy = shelter.model_copy()
                shelter_copy.distance = round(distance, 2)
                shelters_with_distance.append(shelter_copy)

        # 距離順にソート
        shelters_with_distance.sort(key=lambda s: s.distance or float('inf'))

        return shelters_with_distance[:limit]

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
        return self._shelters_cache[:limit]

    def get_shelters_by_type(self, disaster_type: str, limit: int = 50) -> list[ShelterInfo]:
        """
        災害種別で避難所を取得

        Args:
            disaster_type: 災害種別（earthquake, tsunami, flood等）
            limit: 取得件数上限

        Returns:
            list[ShelterInfo]: 該当する避難所リスト
        """
        filtered = [s for s in self._shelters_cache if disaster_type in s.types]
        return filtered[:limit]

    def get_shelter_by_id(self, shelter_id: str) -> Optional[ShelterInfo]:
        """
        IDで避難所を取得

        Args:
            shelter_id: 避難所ID

        Returns:
            ShelterInfo: 避難所情報
        """
        for shelter in self._shelters_cache:
            if shelter.id == shelter_id:
                return shelter
        return None

    async def fetch_and_update_shelter_data(self) -> bool:
        """
        国土地理院からデータを取得して更新（管理用）

        Returns:
            bool: 成功時True
        
        Note:
            この機能は将来の拡張用に予約されています。
            現在はサンプルデータを使用しています。
            
            Issue: #避難所データ自動更新機能の実装
            - 国土地理院のCSV/GeoJSONからデータを取得
            - 定期的なデータ更新スケジューリング
            - データ検証とエラーハンドリング
        """
        logger.info(
            "避難所データの更新機能は今後実装予定です。"
            "現在はサンプルデータを使用しています。"
        )
        return True

    def get_disaster_types(self) -> dict[str, str]:
        """
        対応している災害種別一覧を取得

        Returns:
            dict: 災害種別コードと日本語名のマッピング
        """
        return self.DISASTER_TYPES
