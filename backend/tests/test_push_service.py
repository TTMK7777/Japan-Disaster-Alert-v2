"""
PushNotificationService のユニットテスト
"""
import json
import asyncio
import pytest
from unittest.mock import patch, MagicMock, PropertyMock
from pathlib import Path

from app.exceptions import PushNotificationError
from app.models import PushSubscription
from app.services.push_service import PushNotificationService


# ---------------------------------------------------------------------------
# Helper: PushNotificationService を適切なモック環境で生成する
# ---------------------------------------------------------------------------

def _make_service(
    tmp_path: Path,
    *,
    vapid_public: str = "",
    vapid_private: str = "",
    vapid_email: str = "",
    initial_subscriptions: list | None = None,
    pywebpush_available: bool = True,
):
    """テスト用 PushNotificationService インスタンスを構築する

    __init__ をスキップし、必要なフィールドを直接設定する。
    """
    subs_file = tmp_path / "push_subscriptions.json"
    if initial_subscriptions is not None:
        subs_file.write_text(json.dumps(initial_subscriptions), encoding="utf-8")

    # __init__ をスキップしてインスタンスを生成
    service = object.__new__(PushNotificationService)
    service._subscriptions_path = subs_file
    service._vapid_public_key = vapid_public
    service._vapid_private_key = vapid_private
    service._vapid_claims_email = vapid_email
    service._subscriptions = []
    service._lock = asyncio.Lock()

    # _load_subscriptions を手動実行
    with patch("app.services.push_service.PYWEBPUSH_AVAILABLE", pywebpush_available):
        service._load_subscriptions()

    # is_enabled で使う PYWEBPUSH_AVAILABLE を保持するため、
    # テスト中は service 側で is_enabled を直接制御する
    service._pywebpush_available = pywebpush_available

    return service


# ---------------------------------------------------------------------------
# subscribe
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_subscribe_new(tmp_path):
    """新規サブスクリプションが登録される"""
    service = _make_service(tmp_path)
    sub = PushSubscription(
        endpoint="https://push.example.com/sub1",
        keys={"p256dh": "key1", "auth": "auth1"},
    )

    result = await service.subscribe(sub)
    assert result is True
    assert service.get_subscription_count() == 1


@pytest.mark.asyncio
async def test_subscribe_update_existing(tmp_path):
    """既存エンドポイントのキーが更新される"""
    initial = [
        {
            "endpoint": "https://push.example.com/sub1",
            "keys": {"p256dh": "old_key", "auth": "old_auth"},
            "subscribed_at": "2025-01-01T00:00:00",
        }
    ]
    service = _make_service(tmp_path, initial_subscriptions=initial)
    assert service.get_subscription_count() == 1

    sub = PushSubscription(
        endpoint="https://push.example.com/sub1",
        keys={"p256dh": "new_key", "auth": "new_auth"},
    )
    result = await service.subscribe(sub)
    assert result is True
    # 件数は増えない（更新のみ）
    assert service.get_subscription_count() == 1


# ---------------------------------------------------------------------------
# unsubscribe
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unsubscribe_existing(tmp_path):
    """存在するサブスクリプションが正常に解除される"""
    initial = [
        {
            "endpoint": "https://push.example.com/sub1",
            "keys": {"p256dh": "k", "auth": "a"},
            "subscribed_at": "2025-01-01T00:00:00",
        }
    ]
    service = _make_service(tmp_path, initial_subscriptions=initial)
    result = await service.unsubscribe("https://push.example.com/sub1")
    assert result is True
    assert service.get_subscription_count() == 0


@pytest.mark.asyncio
async def test_unsubscribe_nonexistent_returns_false(tmp_path):
    """存在しないエンドポイントの解除で False が返る"""
    service = _make_service(tmp_path)
    result = await service.unsubscribe("https://push.example.com/not_found")
    assert result is False


# ---------------------------------------------------------------------------
# is_enabled
# ---------------------------------------------------------------------------

def test_is_enabled_with_keys(tmp_path):
    """VAPID鍵がすべて設定されている場合に True"""
    service = _make_service(
        tmp_path,
        vapid_public="pub_key",
        vapid_private="priv_key",
        vapid_email="admin@example.com",
        pywebpush_available=True,
    )
    with patch("app.services.push_service.PYWEBPUSH_AVAILABLE", True):
        assert service.is_enabled is True


def test_is_enabled_without_keys(tmp_path):
    """VAPID鍵が未設定の場合に False"""
    service = _make_service(
        tmp_path,
        vapid_public="",
        vapid_private="",
        vapid_email="",
        pywebpush_available=True,
    )
    with patch("app.services.push_service.PYWEBPUSH_AVAILABLE", True):
        assert service.is_enabled is False


# ---------------------------------------------------------------------------
# send_notification (disabled)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_notification_disabled_raises(tmp_path):
    """is_enabled=False 時に PushNotificationError が発生する"""
    service = _make_service(
        tmp_path,
        vapid_public="",
        vapid_private="",
        vapid_email="",
        pywebpush_available=True,
    )
    with patch("app.services.push_service.PYWEBPUSH_AVAILABLE", True):
        with pytest.raises(PushNotificationError):
            await service.send_notification(title="test", body="test")
