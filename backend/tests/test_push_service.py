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
from app.services import push_service as push_service_module
from app.services.push_service import PushNotificationService, TokenAuthError


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

    # push_service モジュール内の async_session を差し替え + token レート制限状態をリセット
    push_service_module._TOKEN_FAILURES.clear()
    push_service_module._TOKEN_LOCKOUTS.clear()
    with patch("app.services.push_service.async_session", test_session_factory):
        yield test_session_factory

    push_service_module._TOKEN_FAILURES.clear()
    push_service_module._TOKEN_LOCKOUTS.clear()
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
    """新規サブスクリプションが登録され、management_token が返却される"""
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/sub1",
        keys={"p256dh": "key1", "auth": "auth1"},
    )

    result, token = await service.subscribe(sub)
    assert result is True
    assert isinstance(token, str)
    assert len(token) >= 32  # token_urlsafe(32) は 43文字程度
    assert await service.get_subscription_count() == 1


@pytest.mark.asyncio
async def test_subscribe_update_existing(db_session):
    """既存エンドポイントのキー・設定が更新され、既存トークンがそのまま返る"""
    initial_token = "existing_management_token_for_test_12345"
    # 既存行を token 付きで投入
    async with db_session() as session:
        row = PushSubscriptionRow(
            endpoint="https://push.example.com/sub1",
            key_p256dh="old_key",
            key_auth="old_auth",
            management_token=initial_token,
        )
        session.add(row)
        await session.commit()

    service = _make_service()
    assert await service.get_subscription_count() == 1

    sub = PushSubscription(
        endpoint="https://push.example.com/sub1",
        keys={"p256dh": "new_key", "auth": "new_auth"},
    )
    result, token = await service.subscribe(sub)
    assert result is True
    assert token == initial_token  # 同じ token が返る
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
        assert row.management_token == initial_token


@pytest.mark.asyncio
async def test_subscribe_legacy_row_gets_token_backfilled(db_session):
    """legacy row (token=null) に対する再 subscribe で token が補完される"""
    initial = [
        {
            "endpoint": "https://push.example.com/legacy",
            "keys": {"p256dh": "k", "auth": "a"},
        }
    ]
    await _seed_subscriptions(db_session, initial)

    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/legacy",
        keys={"p256dh": "k2", "auth": "a2"},
    )
    result, token = await service.subscribe(sub)
    assert result is True
    assert isinstance(token, str)
    assert len(token) >= 32


# ---------------------------------------------------------------------------
# unsubscribe (Wave 2: token 必須)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unsubscribe_with_correct_token(db_session):
    """正しい token を伴う解除は成功する"""
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/sub1",
        keys={"p256dh": "k", "auth": "a"},
    )
    _, token = await service.subscribe(sub)
    assert token is not None

    result = await service.unsubscribe("https://push.example.com/sub1", token)
    assert result is True
    assert await service.get_subscription_count() == 0


@pytest.mark.asyncio
async def test_unsubscribe_with_wrong_token_raises_mismatch(db_session):
    """不正な token は TokenAuthError(mismatch) を発生させ、行は残る"""
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/sub1",
        keys={"p256dh": "k", "auth": "a"},
    )
    await service.subscribe(sub)

    with pytest.raises(TokenAuthError) as exc_info:
        await service.unsubscribe("https://push.example.com/sub1", "wrong_token_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
    assert exc_info.value.reason == "mismatch"
    # 行は残っているべき
    assert await service.get_subscription_count() == 1


@pytest.mark.asyncio
async def test_unsubscribe_legacy_row_rejected(db_session):
    """token=null の legacy row 操作は TokenAuthError(legacy) で拒否される"""
    initial = [
        {
            "endpoint": "https://push.example.com/legacy",
            "keys": {"p256dh": "k", "auth": "a"},
        }
    ]
    await _seed_subscriptions(db_session, initial)

    service = _make_service()
    with pytest.raises(TokenAuthError) as exc_info:
        await service.unsubscribe("https://push.example.com/legacy", "any_token")
    assert exc_info.value.reason == "legacy"
    # 行は残っているべき
    assert await service.get_subscription_count() == 1


@pytest.mark.asyncio
async def test_unsubscribe_nonexistent_raises_not_found(db_session):
    """存在しないエンドポイントは TokenAuthError(not_found)"""
    service = _make_service()
    with pytest.raises(TokenAuthError) as exc_info:
        await service.unsubscribe("https://push.example.com/not_found", "any_token")
    assert exc_info.value.reason == "not_found"


@pytest.mark.asyncio
async def test_token_rate_limit_locks_after_5_failures(db_session):
    """token 不一致 5回でロックアウト発動 (TokenAuthError(locked))"""
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/rl",
        keys={"p256dh": "k", "auth": "a"},
    )
    await service.subscribe(sub)

    # 5回 mismatch を試行
    for _ in range(5):
        with pytest.raises(TokenAuthError) as exc_info:
            await service.unsubscribe("https://push.example.com/rl", "wrong_xxxxxxxxxxxxxxxxxxxxxxxxxxx")
        # 5回目までは mismatch、しきい値到達後の次の呼び出しから locked となる
        assert exc_info.value.reason in ("mismatch", "locked")

    # 6回目は必ず locked
    with pytest.raises(TokenAuthError) as exc_info:
        await service.unsubscribe("https://push.example.com/rl", "wrong_xxxxxxxxxxxxxxxxxxxxxxxxxxx")
    assert exc_info.value.reason == "locked"


# ---------------------------------------------------------------------------
# update_preferences / get_preferences (Wave 2: token 必須)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_preferences_with_correct_token(db_session):
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/up1",
        keys={"p256dh": "k", "auth": "a"},
    )
    _, token = await service.subscribe(sub)
    assert token is not None

    result = await service.update_preferences(
        "https://push.example.com/up1", token, language="en"
    )
    assert result is True


@pytest.mark.asyncio
async def test_update_preferences_with_wrong_token(db_session):
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/up2",
        keys={"p256dh": "k", "auth": "a"},
    )
    await service.subscribe(sub)

    with pytest.raises(TokenAuthError) as exc_info:
        await service.update_preferences(
            "https://push.example.com/up2", "bad_token_xxxxxxxxxxxxxxxxxxxxx", language="en"
        )
    assert exc_info.value.reason == "mismatch"


@pytest.mark.asyncio
async def test_get_preferences_with_correct_token(db_session):
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/gp1",
        keys={"p256dh": "k", "auth": "a"},
    )
    _, token = await service.subscribe(sub, language="ja")
    assert token is not None

    prefs = await service.get_preferences("https://push.example.com/gp1", token)
    assert prefs is not None
    assert prefs["endpoint"] == "https://push.example.com/gp1"


@pytest.mark.asyncio
async def test_get_preferences_with_wrong_token(db_session):
    service = _make_service()
    sub = PushSubscription(
        endpoint="https://push.example.com/gp2",
        keys={"p256dh": "k", "auth": "a"},
    )
    await service.subscribe(sub)

    with pytest.raises(TokenAuthError):
        await service.get_preferences("https://push.example.com/gp2", "wrong_xxxxxxxxxxxxxxxx")


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
# _build_alert_title (共通化されたタイトル生成)
# ---------------------------------------------------------------------------

def test_build_alert_title_ja_with_severity_prefix():
    """日本語タイトルに重要度プレフィックスが付与される"""
    service = _make_service()
    assert service._build_alert_title("earthquake", "extreme", "ja") == "[緊急] 地震情報"
    assert service._build_alert_title("tsunami", "high", "ja") == "[警報] 津波警報"
    assert service._build_alert_title("flood", "low", "ja") == "洪水警報"


def test_build_alert_title_en_and_fallback():
    """非日本語は英語タイトル、未知の災害種別はフォールバック"""
    service = _make_service()
    assert service._build_alert_title("earthquake", "high", "en") == "[WARNING] Earthquake Alert"
    # 未対応言語は英語にフォールバック
    assert service._build_alert_title("tsunami", "medium", "vi") == "[ADVISORY] Tsunami Warning"
    # 未知の災害種別は汎用タイトル
    assert service._build_alert_title("unknown_type", "low", "ja") == "災害情報 / Disaster Alert"


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
