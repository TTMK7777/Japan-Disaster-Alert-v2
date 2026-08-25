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
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient()
        return self._client

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

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

        client = self._get_client()
        try:
            response = await client.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            earthquakes = []
            for item in data:
                eq = self._parse_earthquake(item)
                if eq:
                    earthquakes.append(eq)

            return self._deduplicate(earthquakes)
        except httpx.HTTPError as e:
            logger.error(f"P2P地震情報取得エラー: {e}", exc_info=True)
            return []

    # 気象庁・P2P が「未確定」を表すために数値欄へ入れてくる番兵値。
    # 欠損（キーが無い）ではなく **値として -1 が入る** ので、
    # dict.get(key, 既定値) では拾えない。
    UNDETERMINED = -1

    # 震源地名にも同じ形の番兵が来る。ただし数値ではなく **空文字**:
    #   {"depth": -1, "latitude": -200, "longitude": -200, "magnitude": -1, "name": ""}
    # キーは存在するので `hypocenter.get("name", "不明")` は既定値に落ちない。
    # 素通しすると画面が**高さ 0px の空の見出し**になる（実ブラウザで確認済み）。
    #
    # 「不明」ではなく「調査中」にしているのは、震度速報の震源地が
    # **分からない**のではなく**まだ決まっていない**ため。数分後の続報で確定する。
    UNDETERMINED_LOCATION = "震源地調査中"

    def _completeness(self, eq: EarthquakeInfo) -> int:
        """利用者から見て情報がどれだけ揃っているかの点数。

        P2P は1つの地震について段階的に複数のレポートを配信する
        （震度速報 → 震源速報 → 詳細）。どれを残すかを決めるのに
        `issue.type` の語彙（ScalePrompt / Destination / DetailScale）へ
        直接依存すると、P2P 側が語彙を変えたときに**エラーも出さずに**
        選択が壊れる。そこで「画面に出せる情報が多いほど良い」という
        利用者側の基準で点数化する。結果の順位は issue.type を見た場合と一致する。
        """
        score = 0
        if eq.max_intensity != "不明":
            score += 2  # 震度は利用者が最初に見る値なので重みを大きくする
        if eq.magnitude > self.UNDETERMINED:
            score += 1
        if eq.depth > self.UNDETERMINED:
            score += 1
        if eq.location and eq.location not in ("不明", self.UNDETERMINED_LOCATION):
            score += 1
        return score

    def _deduplicate(self, earthquakes: list[EarthquakeInfo]) -> list[EarthquakeInfo]:
        """同じ地震の複数レポートを1件にまとめる。

        P2P の `id` は地震ではなく**発表単位**に振られるため重複排除の手がかりにならない。
        発生時刻（秒精度）でまとめる。同一秒に別々の地震が起きることは事実上ない。

        取得件数は減る（20件要求して10件前後になる）。これを埋めるための過剰取得は
        あえてしない。公開APIへの負荷を3倍にするより、件数が減る方が妥当と判断した。
        """
        best: dict[str, EarthquakeInfo] = {}
        order: list[str] = []

        for index, eq in enumerate(earthquakes):
            # 発生時刻が空の場合にキーを共有させると、**全件が1つに潰れて
            # 地震が1件しか出なくなる**。束ねずにそのまま残す
            key = eq.time or f"__no_time_{index}"
            if key not in best:
                best[key] = eq
                order.append(key)
            elif self._completeness(eq) > self._completeness(best[key]):
                best[key] = eq

        return [best[key] for key in order]

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
            # 番兵は「キーが無い」ではなく「空文字が入っている」形で来るので、
            # get の既定値では拾えない。空白のみも同じ扱いにする
            location = (hypocenter.get("name") or "").strip() or self.UNDETERMINED_LOCATION
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
        # 震度速報の段階では規模も深さも未確定で、値として -1 が入ってくる。
        # そのまま書くと「マグニチュード-1、震源の深さは約-1km」という
        # 物理的にありえない文が利用者に届く（実際に画面へ出ていた）。
        # 未確定の項目は数値を騙らず、文ごと省く
        if location == self.UNDETERMINED_LOCATION:
            # 「【地震情報】で地震がありました。」と助詞だけが残る文にしない
            msg = "【地震情報】地震がありました。震源地は現在調査中です。"
        else:
            msg = f"【地震情報】{location}で地震がありました。"
        if magnitude > self.UNDETERMINED:
            msg += f"マグニチュード{magnitude}、最大震度{max_intensity}。"
        else:
            msg += f"最大震度{max_intensity}。規模は現在調査中です。"
        if depth > self.UNDETERMINED:
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

        client = self._get_client()
        try:
            response = await client.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error(f"体感報告取得エラー: {e}", exc_info=True)
            return []
