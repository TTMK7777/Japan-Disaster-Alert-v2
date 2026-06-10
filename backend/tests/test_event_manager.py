"""
EventManager のユニットテスト

SSE クライアント管理（接続上限・ブロードキャスト・キュー満杯時の切断通知）を検証する。
"""
import asyncio

import pytest

from app.services.event_manager import EventManager


@pytest.mark.asyncio
async def test_connect_and_broadcast():
    """接続したクライアントにイベントが配信される"""
    manager = EventManager()
    queue = await manager.connect()

    await manager.broadcast("heartbeat", {"time": "2026-01-01T00:00:00"})

    message = queue.get_nowait()
    assert message.startswith("event: heartbeat\n")
    assert "2026-01-01T00:00:00" in message

    await manager.disconnect(queue)
    assert len(manager._clients) == 0


@pytest.mark.asyncio
async def test_connect_limit():
    """接続数が上限に達すると ConnectionError"""
    manager = EventManager()
    manager.MAX_SSE_CLIENTS = 2
    await manager.connect()
    await manager.connect()

    with pytest.raises(ConnectionError):
        await manager.connect()


@pytest.mark.asyncio
async def test_broadcast_full_queue_disconnects_client_with_sentinel():
    """キュー満杯のクライアントはリストから外され、sentinel(None) で終了通知される"""
    manager = EventManager()
    queue = await manager.connect()

    # キューを満杯にする
    for _ in range(queue.maxsize):
        queue.put_nowait("dummy")

    await manager.broadcast("earthquake", {"earthquakes": []})

    # クライアントリストから除外されている
    assert queue not in manager._clients

    # generate_stream が sentinel を検出してストリームを終了する
    async def consume():
        messages = []
        async for msg in manager.generate_stream(queue):
            messages.append(msg)
        return messages

    messages = await asyncio.wait_for(consume(), timeout=5)
    # dummy メッセージは流れるが、sentinel(None) でループが終了する
    assert messages == ["dummy"] * (queue.maxsize - 1)


@pytest.mark.asyncio
async def test_generate_stream_yields_messages_until_sentinel():
    """generate_stream はキューのメッセージを順に yield し、None で停止する"""
    manager = EventManager()
    queue: asyncio.Queue = asyncio.Queue(maxsize=10)
    queue.put_nowait("event: test\ndata: {}\n\n")
    queue.put_nowait(None)

    messages = []
    async for msg in manager.generate_stream(queue):
        messages.append(msg)

    assert messages == ["event: test\ndata: {}\n\n"]
