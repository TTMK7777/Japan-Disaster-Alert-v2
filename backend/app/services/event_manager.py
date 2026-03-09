"""
SSEイベント管理サービス

バックグラウンドでデータソースを監視し、変更を検出してSSEクライアントにブロードキャストする。
"""
import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator, Optional
from ..utils.logger import get_logger

logger = get_logger(__name__)


class EventManager:
    """SSEイベントマネージャー"""

    POLL_INTERVAL = 10  # seconds - データソースをチェックする間隔
    HEARTBEAT_INTERVAL = 30  # seconds - ハートビート送信間隔
    MAX_SSE_CLIENTS = 500  # SSE同時接続数の上限

    def __init__(self):
        self._clients: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        # 差分検出用の最終データ
        self._last_earthquake_ids: set[str] = set()
        self._last_tsunami_ids: set[str] = set()

    async def connect(self) -> asyncio.Queue:
        """新しいSSEクライアントを登録

        Raises:
            ConnectionError: 接続数が上限に達した場合
        """
        async with self._lock:
            if len(self._clients) >= self.MAX_SSE_CLIENTS:
                raise ConnectionError("SSEクライアント数が上限に達しました")
            queue: asyncio.Queue = asyncio.Queue(maxsize=50)
            self._clients.append(queue)
        logger.info(f"SSEクライアント接続 (合計: {len(self._clients)})")
        return queue

    async def disconnect(self, queue: asyncio.Queue) -> None:
        """切断されたSSEクライアントを削除"""
        async with self._lock:
            if queue in self._clients:
                self._clients.remove(queue)
        logger.info(f"SSEクライアント切断 (残り: {len(self._clients)})")

    async def broadcast(self, event: str, data: dict) -> None:
        """全接続クライアントにイベントをブロードキャスト"""
        message = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
        async with self._lock:
            alive = []
            for queue in self._clients:
                try:
                    queue.put_nowait(message)
                    alive.append(queue)
                except asyncio.QueueFull:
                    logger.warning("キュー満杯のSSEクライアントを切断")
            self._clients = alive

    async def start(self, p2p_service, tsunami_service) -> None:
        """バックグラウンド監視タスクを開始"""
        async with self._lock:
            if self._running:
                return
            self._running = True
            self._p2p_service = p2p_service
            self._tsunami_service = tsunami_service
            self._task = asyncio.create_task(self._monitor_loop())
            logger.info("SSEイベント監視開始")

    async def stop(self) -> None:
        """バックグラウンド監視を停止"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("SSEイベント監視停止")

    async def _monitor_loop(self) -> None:
        """メイン監視ループ - データソースをポーリングし変更を検出"""
        heartbeat_counter = 0
        while self._running:
            try:
                # 接続クライアントがいる場合のみポーリング
                if self._clients:
                    await self._check_earthquakes()
                    await self._check_tsunamis()

                # HEARTBEAT_INTERVALごとにハートビート送信
                heartbeat_counter += self.POLL_INTERVAL
                if heartbeat_counter >= self.HEARTBEAT_INTERVAL:
                    heartbeat_counter = 0
                    if self._clients:
                        await self.broadcast("heartbeat", {
                            "time": datetime.now().isoformat(),
                            "clients": len(self._clients),
                        })

                await asyncio.sleep(self.POLL_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"SSE監視ループエラー: {e}", exc_info=True)
                await asyncio.sleep(self.POLL_INTERVAL)

    async def _check_earthquakes(self) -> None:
        """地震情報の更新をチェック"""
        try:
            earthquakes = await self._p2p_service.get_recent_earthquakes(limit=10)
            current_ids = {eq.id for eq in earthquakes}

            if current_ids != self._last_earthquake_ids:
                self._last_earthquake_ids = current_ids
                # 地震情報をシリアライズして配信
                eq_data = [eq.model_dump() for eq in earthquakes]
                await self.broadcast("earthquake", {
                    "earthquakes": eq_data,
                    "updated_at": datetime.now().isoformat(),
                })
                logger.debug(f"地震情報更新配信: {len(earthquakes)}件")
        except Exception as e:
            logger.error(f"地震情報チェックエラー: {e}")

    async def _check_tsunamis(self) -> None:
        """津波警報の更新をチェック"""
        try:
            active = await self._tsunami_service.get_active_warnings()
            current_ids = {t.id for t in active}

            if current_ids != self._last_tsunami_ids:
                self._last_tsunami_ids = current_ids
                # 津波情報をシリアライズして配信
                t_data = [t.model_dump() for t in active]
                await self.broadcast("tsunami", {
                    "tsunamis": t_data,
                    "updated_at": datetime.now().isoformat(),
                })
                logger.debug(f"津波情報更新配信: {len(active)}件")
        except Exception as e:
            logger.error(f"津波情報チェックエラー: {e}")

    async def generate_stream(self, queue: asyncio.Queue) -> AsyncGenerator[str, None]:
        """クライアント向けSSEストリームを生成"""
        try:
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=60)
                    yield message
                except asyncio.TimeoutError:
                    # キープアライブコメントを送信
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
