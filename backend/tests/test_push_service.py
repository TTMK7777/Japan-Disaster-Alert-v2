"""
PushNotificationService のユニットテスト

SQLAlchemy async session を使った DB ベースのサブスクリプション管理をテストする。
テスト毎にインメモリ SQLite を使い分離する。
"""
import asyncio
import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.db_models import PushSubscriptionRow
from app.exceptions import PushNotificationError
from app.models import PushSubscription
from app.services.push_service import PushNotificationService


# ---------------------------------------------------------------------------
# Fixtures: インメモリ SQLite でテスト用 DB を構築
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def db_session():
    """テスト用インメモリ DB エンジン・セッションを構築し、
    push_service が参照する async_session を差し替える。
    """
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)

    # テーブル作成
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # push_service モジュール内の async_session を差し替え
    with patch("app.services.push_service.async_session", test_session_factory):
        yield test_session_factory

    await engine.dispose()


def _make_service(
    *,
    vapid_public: str = "",
    vapid_private: str = "",
    vapid_email: str = "",
    pywebpush_available: bool = True,
) -> PushNotificationService:
    """テスト用 PushNotificationService インスタンスを構築する

    __init__ をスキップし、必要なフィールドを直接設定する。
    """
    service = object.__new__(PushNotificationService)
    service._vapid_public_key = vapid_public
    service._vapid_private_key = vapid_private
    service._vapid_claims_email = vapid_email
    return service


async def _seed_subscriptions(
    session_factory: async_sessionmaker,
    subscriptions: list[dict],
) -> None:
    """テスト用の初期サブスクリプションを DB に投入する"""
    async with session_factory() as session:
        for sub in subscriptions:
            row = PushSubscriptionRow(
                endpoint=sub["endpoint"],
                key_p256dh=sub.get("keys", {}).get("p256dh", ""),
                key_auth=sub.get("keys", {}).get("auth", ""),
            )
            session.add(row)
        await session.commit()


# ---------------------------------------------------------------------------
# subscribe
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_subscribe_new(db_session):
    """新規サブスクリプションが登録される"""
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/sub1",
        keys={"p256dh": "key1", "auth": "auth1"},
    )

    result = await service.subscribe(sub)
    assert result is True
    assert await service.get_subscription_count() == 1


@pytest.mark.asyncio
async def test_subscribe_update_existing(db_session):
    """既存エンドポイントのキーが更新される"""
    initial = [
        {
            "endpoint": "https://push.example.com/sub1",
            "keys": {"p256dh": "old_key", "auth": "old_auth"},
        }
    ]
    await _seed_subscriptions(db_session, initial)

    service = _make_service()
    assert await service.get_subscription_count() == 1

    sub = PushSubscription(
        endpoint="https://push.example.com/sub1",
        keys={"p256dh": "new_key", "auth": "new_auth"},
    )
    result = await service.subscribe(sub)
    assert result is True
    # 件数は増えない（更新のみ）
    assert await service.get_subscription_count() == 1

    # キーが更新されていることを確認
    async with db_session() as session:
        stmt = select(PushSubscriptionRow).where(
            PushSubscriptionRow.endpoint == "https://push.example.com/sub1"
        )
        row = (await session.execute(stmt)).scalar_one()
        assert row.key_p256dh == "new_key"
        assert row.key_auth == "new_auth"


# ---------------------------------------------------------------------------
# unsubscribe
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unsubscribe_existing(db_session):
    """存在するサブスクリプションが正常に解除される"""
    initial = [
        {
            "endpoint": "https://push.example.com/sub1",
            "keys": {"p256dh": "k", "auth": "a"},
        }
    ]
    await _seed_subscriptions(db_session, initial)

    service = _make_service()
    result = await service.unsubscribe("https://push.example.com/sub1")
    assert result is True
    assert await service.get_subscription_count() == 0


@pytest.mark.asyncio
async def test_unsubscribe_nonexistent_returns_false(db_session):
    """存在しないエンドポイントの解除で False が返る"""
    service = _make_service()
    result = await service.unsubscribe("https://push.example.com/not_found")
    assert result is False


# ---------------------------------------------------------------------------
# is_enabled
# ---------------------------------------------------------------------------

def test_is_enabled_with_keys():
    """VAPID鍵がすべて設定されている場合に True"""
    service = _make_service(
        vapid_public="pub_key",
        vapid_private="priv_key",
        vapid_email="admin@example.com",
        pywebpush_available=True,
    )
    with patch("app.services.push_service.PYWEBPUSH_AVAILABLE", True):
        assert service.is_enabled is True


def test_is_enabled_without_keys():
    """VAPID鍵が未設定の場合に False"""
    service = _make_service(
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
async def test_send_notification_disabled_raises(db_session):
    """is_enabled=False 時に PushNotificationError が発生する"""
    service = _make_service(
        vapid_public="",
        vapid_private="",
        vapid_email="",
        pywebpush_available=True,
    )
    with patch("app.services.push_service.PYWEBPUSH_AVAILABLE", True):
        with pytest.raises(PushNotificationError):
            await service.send_notification(title="test", body="test")


# ---------------------------------------------------------------------------
# get_subscription_count
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_subscription_count_empty(db_session):
    """空のDBで0が返る"""
    service = _make_service()
    assert await service.get_subscription_count() == 0


@pytest.mark.asyncio
async def test_get_subscription_count_with_data(db_session):
    """データがある場合に正しい件数が返る"""
    subs = [
        {"endpoint": "https://push.example.com/sub1", "keys": {"p256dh": "k1", "auth": "a1"}},
        {"endpoint": "https://push.example.com/sub2", "keys": {"p256dh": "k2", "auth": "a2"}},
        {"endpoint": "https://push.example.com/sub3", "keys": {"p256dh": "k3", "auth": "a3"}},
    ]
    await _seed_subscriptions(db_session, subs)

    service = _make_service()
    assert await service.get_subscription_count() == 3
