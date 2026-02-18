"""
気象庁 津波情報サービス
"""
import httpx
from typing import Optional
from datetime import datetime
from ..models import TsunamiInfo
from ..utils.logger import get_logger

logger = get_logger(__name__)


class TsunamiService:
    """気象庁の津波情報を取得するサービス"""

    def __init__(self):
        from ..config import settings
        self.BASE_URL = settings.jma_base_url
        self.timeout = settings.api_timeout

    # 津波警報レベルマッピング
    TSUNAMI_LEVELS = {
        "大津波警報": "major_warning",
        "津波警報": "warning",
        "津波注意報": "advisory",
        "津波予報（若干の海面変動）": "forecast",
        "なし": "none",
    }

    async def get_tsunami_list(self, limit: int = 10) -> list[TsunamiInfo]:
        """
        津波情報一覧を取得

        Args:
            limit: 取得件数

        Returns:
            list[TsunamiInfo]: 津波情報リスト
        """
        url = f"{self.BASE_URL}/tsunami/data/list.json"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()
                return self._parse_tsunami_list(data[:limit])
            except httpx.HTTPError as e:
                logger.error(f"津波情報取得エラー: {e}", exc_info=True)
                return []

    def _parse_tsunami_list(self, data: list) -> list[TsunamiInfo]:
        """APIレスポンスを津波情報リストにパース"""
        tsunamis = []

        for item in data:
            try:
                # 座標情報のパース
                coordinates = item.get("cod", "")
                lat, lon = self._parse_coordinates(coordinates)

                # 警報レベルの判定
                warning_level = self._determine_warning_level(item.get("kind", []))

                tsunami = TsunamiInfo(
                    id=item.get("ctt", ""),
                    event_id=item.get("eid", ""),
                    title=item.get("ttl", ""),
                    title_en=item.get("en_ttl"),
                    report_datetime=item.get("rdt", ""),
                    earthquake_time=item.get("at"),
                    earthquake_location=item.get("anm", ""),
                    earthquake_location_en=item.get("en_anm"),
                    magnitude=item.get("mag"),
                    coordinates=coordinates,
                    warning_level=warning_level,
                    areas=item.get("kind", []),
                    message=self._generate_message(item)
                )
                tsunamis.append(tsunami)
            except Exception as e:
                logger.error(f"津波情報パースエラー: {e}", exc_info=True)
                continue

        return tsunamis

    def _parse_coordinates(self, coord_str: str) -> tuple[Optional[float], Optional[float]]:
        """座標文字列をパース（例: +40.9+143.0-20000/）"""
        try:
            if not coord_str:
                return None, None
            # 末尾のスラッシュを除去
            coord_str = coord_str.rstrip("/")
            # 深さ情報を除去
            parts = coord_str.split("-")
            if len(parts) >= 2:
                coord_str = parts[0]

            # 緯度・経度を抽出
            lat = None
            lon = None
            if "+" in coord_str:
                segments = coord_str.split("+")
                if len(segments) >= 3:
                    lat = float(segments[1])
                    lon = float(segments[2])
            return lat, lon
        except Exception:
            return None, None

    def _determine_warning_level(self, kind_list: list) -> str:
        """警報レベルを判定"""
        for kind in kind_list:
            name = kind.get("name", "")
            if "大津波警報" in name:
                return "major_warning"
            elif "津波警報" in name:
                return "warning"
            elif "津波注意報" in name:
                return "advisory"
        return "none"

    def _generate_message(self, item: dict) -> str:
        """津波情報メッセージを生成"""
        location = item.get("anm", "不明")
        magnitude = item.get("mag", "不明")
        title = item.get("ttl", "")

        if "大津波警報" in title or "津波警報" in title:
            return f"【{title}】{location}でマグニチュード{magnitude}の地震が発生しました。直ちに高台へ避難してください。"
        elif "津波注意報" in title:
            return f"【{title}】{location}でマグニチュード{magnitude}の地震が発生しました。海岸から離れてください。"
        else:
            return f"【津波情報】{location}でマグニチュード{magnitude}の地震が発生しました。{title}"

    async def get_active_warnings(self) -> list[TsunamiInfo]:
        """
        現在発令中の津波警報・注意報を取得

        Returns:
            list[TsunamiInfo]: 発令中の津波警報リスト
        """
        all_tsunamis = await self.get_tsunami_list(limit=20)
        # 最新の情報から警報・注意報のみをフィルタリング
        active = [t for t in all_tsunamis if t.warning_level in ["major_warning", "warning", "advisory"]]
        return active

    async def get_tsunami_detail(self, json_filename: str) -> Optional[dict]:
        """
        津波情報の詳細を取得

        Args:
            json_filename: 詳細JSONファイル名

        Returns:
            dict: 詳細情報
        """
        url = f"{self.BASE_URL}/tsunami/data/{json_filename}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, timeout=self.timeout)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error(f"津波詳細情報取得エラー: {e}", exc_info=True)
                return None
