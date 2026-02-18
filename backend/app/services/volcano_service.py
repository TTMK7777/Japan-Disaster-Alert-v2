"""
気象庁 火山情報サービス
"""
import httpx
from typing import Optional
from ..models import VolcanoInfo, VolcanoWarning
from ..utils.logger import get_logger

logger = get_logger(__name__)


class VolcanoService:
    """気象庁の火山情報を取得するサービス"""

    def __init__(self):
        from ..config import settings
        self.BASE_URL = f"{settings.jma_base_url}/volcano"
        self.timeout = settings.api_timeout

    # 噴火警戒レベルの説明
    ALERT_LEVELS = {
        1: {"name": "活火山であることに留意", "severity": "low", "action": "火口内立入規制"},
        2: {"name": "火口周辺規制", "severity": "medium", "action": "火口周辺への立入規制"},
        3: {"name": "入山規制", "severity": "high", "action": "登山禁止・入山規制"},
        4: {"name": "高齢者等避難", "severity": "high", "action": "警戒が必要な居住地域での高齢者等の避難準備"},
        5: {"name": "避難", "severity": "extreme", "action": "危険な居住地域からの避難"},
    }

    # 主要な監視対象火山（常時観測火山）
    MONITORED_VOLCANOES = [
        314,  # 富士山
        312,  # 箱根山
        503,  # 阿蘇山
        506,  # 桜島
        507,  # 霧島山
        502,  # 雲仙岳
        306,  # 浅間山
        101,  # 十勝岳
        102,  # 樽前山
        103,  # 有珠山
        202,  # 岩手山
        205,  # 蔵王山
        301,  # 那須岳
        302,  # 日光白根山
        303,  # 草津白根山
        504,  # 薩摩硫黄島
        505,  # 口永良部島
        601,  # 諏訪之瀬島
        509,  # 新燃岳
        510,  # 硫黄島
    ]

    async def get_volcano_list(self) -> list[VolcanoInfo]:
        """
        火山一覧を取得

        Returns:
            list[VolcanoInfo]: 火山情報リスト
        """
        url = f"{self.BASE_URL}/const/volcano_list.json"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()
                return self._parse_volcano_list(data)
            except httpx.HTTPError as e:
                logger.error(f"火山一覧取得エラー: {e}", exc_info=True)
                return []

    def _parse_volcano_list(self, data: list) -> list[VolcanoInfo]:
        """APIレスポンスを火山情報リストにパース"""
        volcanoes = []

        for item in data:
            try:
                code = item.get("code", 0)
                latlon = item.get("latlon", [None, None])
                lat = latlon[0] if len(latlon) > 0 else None
                lon = latlon[1] if len(latlon) > 1 else None

                volcano = VolcanoInfo(
                    code=code,
                    name=item.get("name_jp", ""),
                    name_en=item.get("name_en"),
                    latitude=lat,
                    longitude=lon,
                    is_monitored=code in self.MONITORED_VOLCANOES or item.get("levelOperation", False),
                )
                volcanoes.append(volcano)
            except Exception as e:
                logger.error(f"火山情報パースエラー: {e}", exc_info=True)
                continue

        return volcanoes

    async def get_monitored_volcanoes(self) -> list[VolcanoInfo]:
        """
        常時観測火山のみを取得

        Returns:
            list[VolcanoInfo]: 常時観測火山リスト
        """
        all_volcanoes = await self.get_volcano_list()
        return [v for v in all_volcanoes if v.is_monitored]

    async def get_volcano_warnings(self) -> list[dict]:
        """
        火山警報を取得

        Returns:
            list[dict]: 火山警報リスト
        """
        # 各監視火山の警報情報を取得
        warnings = []

        async with httpx.AsyncClient() as client:
            for volcano_code in self.MONITORED_VOLCANOES:
                try:
                    url = f"{self.BASE_URL}/data/warning/{volcano_code}.json"
                    response = await client.get(url, timeout=self.timeout)
                    if response.status_code == 200:
                        data = response.json()
                        if data:
                            warning = self._parse_volcano_warning(data, volcano_code)
                            if warning:
                                warnings.append(warning)
                except httpx.HTTPError:
                    continue
                except Exception as e:
                    logger.warning(f"火山警報取得エラー ({volcano_code}): {e}")
                    continue

        return warnings

    def _parse_volcano_warning(self, data: dict, volcano_code: int) -> Optional[dict]:
        """火山警報情報をパース"""
        try:
            # 警報レベルを抽出
            level = data.get("level")
            if level is None:
                return None

            level_info = self.ALERT_LEVELS.get(level, {})

            return {
                "volcano_code": volcano_code,
                "alert_level": level,
                "alert_level_name": level_info.get("name", ""),
                "severity": level_info.get("severity", "low"),
                "action": level_info.get("action", ""),
                "issued_at": data.get("reportDatetime", ""),
                "headline": data.get("headlineText", ""),
            }
        except Exception as e:
            logger.error(f"火山警報パースエラー: {e}", exc_info=True)
            return None

    async def get_volcano_by_code(self, code: int) -> Optional[VolcanoInfo]:
        """
        コードで特定の火山情報を取得

        Args:
            code: 火山コード

        Returns:
            VolcanoInfo: 火山情報
        """
        all_volcanoes = await self.get_volcano_list()
        for volcano in all_volcanoes:
            if volcano.code == code:
                return volcano
        return None

    def get_alert_level_info(self, level: int) -> dict:
        """
        警戒レベルの詳細情報を取得

        Args:
            level: 警戒レベル（1-5）

        Returns:
            dict: レベル情報
        """
        return self.ALERT_LEVELS.get(level, {})
