"""
P2P地震情報API連携サービス
"""
import httpx
from typing import Optional
from ..models import EarthquakeInfo
from ..utils.logger import get_logger

logger = get_logger(__name__)


class P2PQuakeService:
    """P2P地震情報サービス"""

    def __init__(self):
        from ..config import settings
        self.BASE_URL = settings.p2p_base_url
        self.timeout = settings.api_timeout

    # 震度変換マッピング
    INTENSITY_MAP = {
        10: "1",
        20: "2",
        30: "3",
        40: "4",
        45: "5弱",
        50: "5強",
        55: "6弱",
        60: "6強",
        70: "7"
    }

    # 津波警報マッピング
    TSUNAMI_MAP = {
        "None": "なし",
        "Unknown": "不明",
        "Checking": "調査中",
        "NonEffective": "若干の海面変動",
        "Watch": "津波注意報",
        "Warning": "津波警報"
    }

    async def get_recent_earthquakes(self, limit: int = 10) -> list[EarthquakeInfo]:
        """
        最新の地震情報を取得

        Args:
            limit: 取得件数（デフォルト: 10）

        Returns:
            list[EarthquakeInfo]: 地震情報リスト。取得に失敗した場合は空リストを返す。

        Raises:
            httpx.HTTPError: APIリクエストに失敗した場合（内部でキャッチされ、空リストを返す）
        """
        url = f"{self.BASE_URL}/history"
        params = {
            "codes": 551,  # 地震情報コード
            "limit": limit
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, params=params, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()

                earthquakes = []
                for item in data:
                    eq = self._parse_earthquake(item)
                    if eq:
                        earthquakes.append(eq)

                return earthquakes
            except httpx.HTTPError as e:
                logger.error(f"P2P地震情報取得エラー: {e}", exc_info=True)
                return []

    def _parse_earthquake(self, data: dict) -> Optional[EarthquakeInfo]:
        """
        地震データをパース

        Args:
            data: APIレスポンスデータ

        Returns:
            EarthquakeInfo: パースされた地震情報
        """
        try:
            eq_data = data.get("earthquake", {})
            hypocenter = eq_data.get("hypocenter", {})

            # 震度変換
            max_scale = eq_data.get("maxScale", 0)
            max_intensity = self.INTENSITY_MAP.get(max_scale, "不明")

            # 津波情報変換
            tsunami = eq_data.get("domesticTsunami", "Unknown")
            tsunami_warning = self.TSUNAMI_MAP.get(tsunami, "不明")

            # メッセージ生成
            location = hypocenter.get("name", "不明")
            magnitude = hypocenter.get("magnitude", 0)
            depth = hypocenter.get("depth", 0)

            message = self._generate_message(
                location=location,
                magnitude=magnitude,
                max_intensity=max_intensity,
                depth=depth,
                tsunami_warning=tsunami_warning
            )

            return EarthquakeInfo(
                id=data.get("id", ""),
                time=eq_data.get("time", ""),
                location=location,
                magnitude=magnitude,
                max_intensity=max_intensity,
                depth=depth,
                latitude=hypocenter.get("latitude", 0),
                longitude=hypocenter.get("longitude", 0),
                tsunami_warning=tsunami_warning,
                message=message,
                source="気象庁"
            )
        except Exception as e:
            logger.error(f"地震データパースエラー: {e}", exc_info=True)
            return None

    def _generate_message(
        self,
        location: str,
        magnitude: float,
        max_intensity: str,
        depth: int,
        tsunami_warning: str
    ) -> str:
        """
        地震情報メッセージを生成

        Args:
            location: 震源地
            magnitude: マグニチュード
            max_intensity: 最大震度
            depth: 震源の深さ
            tsunami_warning: 津波警報

        Returns:
            str: 生成されたメッセージ
        """
        msg = f"【地震情報】{location}で地震がありました。"
        msg += f"マグニチュード{magnitude}、最大震度{max_intensity}。"
        msg += f"震源の深さは約{depth}km。"

        if tsunami_warning != "なし":
            msg += f"津波情報：{tsunami_warning}。"
        else:
            msg += "この地震による津波の心配はありません。"

        return msg

    async def get_user_reports(self, limit: int = 10) -> list[dict]:
        """
        ユーザーからの体感報告を取得

        Args:
            limit: 取得件数

        Returns:
            list: 体感報告リスト
        """
        url = f"{self.BASE_URL}/history"
        params = {
            "codes": 555,  # ユーザー報告コード
            "limit": limit
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, params=params, timeout=self.timeout)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error(f"体感報告取得エラー: {e}", exc_info=True)
                return []
