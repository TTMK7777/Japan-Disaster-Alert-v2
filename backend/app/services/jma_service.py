"""
気象庁API連携サービス
"""
import httpx
from typing import Optional
from ..models import WeatherInfo, DisasterAlert
from ..utils.logger import get_logger
from ..utils.area_codes import AREA_CODES, get_area_code

logger = get_logger(__name__)


class JMAService:
    """気象庁データ取得サービス"""

    def __init__(self):
        from ..config import settings
        self.BASE_URL = settings.jma_base_url
        self.timeout = settings.api_timeout
        # 都道府県コードマッピング（共通ユーティリティから取得）
        self.AREA_CODES = AREA_CODES

    async def get_weather_forecast(self, area_code: str) -> Optional[WeatherInfo]:
        """
        指定地域の天気概況を取得

        Args:
            area_code: 地域コード（例: 130000=東京都）

        Returns:
            Optional[WeatherInfo]: 天気情報。取得に失敗した場合はNoneを返す。

        Raises:
            httpx.HTTPError: APIリクエストに失敗した場合（内部でキャッチされ、Noneを返す）
        """
        url = f"{self.BASE_URL}/forecast/data/overview_forecast/{area_code}.json"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()

                return WeatherInfo(
                    area=data.get("targetArea", ""),
                    area_code=area_code,
                    publishing_office=data.get("publishingOffice", "気象庁"),
                    report_datetime=data.get("reportDatetime", ""),
                    headline=data.get("headlineText"),
                    text=data.get("text", "")
                )
            except httpx.HTTPError as e:
                logger.error(f"気象情報取得エラー: {e}", exc_info=True)
                return None

    async def get_earthquake_list(self, limit: int = 10) -> list[dict]:
        """
        最新の地震情報一覧を取得

        Args:
            limit: 取得件数

        Returns:
            list: 地震情報リスト
        """
        url = f"{self.BASE_URL}/quake/data/list.json"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()
                return data[:limit]
            except httpx.HTTPError as e:
                logger.error(f"地震情報取得エラー: {e}", exc_info=True)
                return []

    async def get_current_alerts(self) -> list[DisasterAlert]:
        """
        現在発令中の警報・注意報を取得

        Returns:
            list[DisasterAlert]: 警報リスト
        
        Note:
            このメソッドは将来の拡張用に予約されています。
            現在はWarningServiceを使用してください。
        """
        # 注意: このメソッドは将来の拡張用です
        # 現在はWarningService.get_warnings()を使用してください
        logger.warning("get_current_alerts()は非推奨です。WarningServiceを使用してください。")
        return []

    def get_area_code(self, prefecture_name: str) -> Optional[str]:
        """
        都道府県名から地域コードを取得

        Args:
            prefecture_name: 都道府県名

        Returns:
            str: 地域コード
        """
        return get_area_code(prefecture_name)
