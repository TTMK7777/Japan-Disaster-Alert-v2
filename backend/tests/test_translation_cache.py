"""
TranslationCache のユニットテスト

DB永続化版: L1インメモリdict + L2 SQLAlchemy DB
"""
import hashlib

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.db_models import TranslationCacheRow
from app.services.translation_cache import TranslationCache


# ---------------------------------------------------------------------------
# テスト用DBセットアップ
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def db_session():
    """テスト用インメモリSQLiteセッション"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield session_factory

    await engine.dispose()


@pytest.fixture
def cache():
    """TranslationCache インスタンス（DB未接続）"""
    return TranslationCache()


# ---------------------------------------------------------------------------
# make_key
# ---------------------------------------------------------------------------

def test_cache_make_key():
    """SHA-256ハッシュキーが正しく生成される"""
    text = "東京都"
    lang = "en"
    expected = hashlib.sha256(f"{text}:{lang}".encode()).hexdigest()

    result = TranslationCache.make_key(text, lang)
    assert result == expected


# ---------------------------------------------------------------------------
# get / contains（同期・インメモリ）
# ---------------------------------------------------------------------------

def test_cache_get_miss(cache):
    """存在しないキーで None が返る"""
    assert cache.get("nonexistent") is None


def test_cache_contains_empty(cache):
    """空のキャッシュで contains は False"""
    assert cache.contains("nonexistent") is False


# ---------------------------------------------------------------------------
# set / get（非同期・DB永続化）
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cache_set_and_get(cache, db_session, monkeypatch):
    """set() でインメモリdictに保存され、get() で取得できる"""
    monkeypatch.setattr("app.services.translation_cache.async_session", db_session, raising=False)
    # async_session はモジュールレベルのインポートではなく関数内インポートなので
    # database モジュール側をパッチする
    monkeypatch.setattr("app.database.async_session", db_session)

    await cache.set("key1", "value1")

    # インメモリから取得
    assert cache.get("key1") == "value1"
    assert cache.contains("key1") is True


@pytest.mark.asyncio
async def test_cache_set_writes_to_db(cache, db_session, monkeypatch):
    """set() でDBにも書き込まれる"""
    monkeypatch.setattr("app.database.async_session", db_session)

    await cache.set("db_key", "db_value")

    # DBから直接確認
    async with db_session() as session:
        result = await session.execute(
            select(TranslationCacheRow).where(TranslationCacheRow.cache_key == "db_key")
        )
        row = result.scalar_one_or_none()
        assert row is not None
        assert row.value == "db_value"


@pytest.mark.asyncio
async def test_cache_set_upsert(cache, db_session, monkeypatch):
    """同じキーで set() を2回呼ぶと値が更新される（UPSERT）"""
    monkeypatch.setattr("app.database.async_session", db_session)

    await cache.set("upsert_key", "old_value")
    await cache.set("upsert_key", "new_value")

    # インメモリ
    assert cache.get("upsert_key") == "new_value"

    # DB
    async with db_session() as session:
        result = await session.execute(
            select(TranslationCacheRow).where(TranslationCacheRow.cache_key == "upsert_key")
        )
        row = result.scalar_one_or_none()
        assert row is not None
        assert row.value == "new_value"


# ---------------------------------------------------------------------------
# init（DBからの復元）
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cache_init_loads_from_db(db_session, monkeypatch):
    """init() でDBからインメモリdictに復元される"""
    monkeypatch.setattr("app.database.async_session", db_session)

    # DBに直接レコードを挿入
    async with db_session() as session:
        session.add(TranslationCacheRow(cache_key="pre_key1", value="pre_value1"))
        session.add(TranslationCacheRow(cache_key="pre_key2", value="pre_value2"))
        await session.commit()

    # 新しいインスタンスで init()
    cache = TranslationCache()
    await cache.init()

    assert cache.get("pre_key1") == "pre_value1"
    assert cache.get("pre_key2") == "pre_value2"
    assert cache.contains("pre_key1") is True


# ---------------------------------------------------------------------------
# DB障害時のグレースフルフォールバック
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cache_set_db_failure_keeps_inmemory(cache, monkeypatch):
    """DB書き込み失敗時もインメモリには保存される"""
    # async_session が例外を投げるようにする
    class _BrokenSessionCtx:
        async def __aenter__(self):
            raise RuntimeError("DB connection failed")
        async def __aexit__(self, *args):
            pass

    def broken_session():
        return _BrokenSessionCtx()

    monkeypatch.setattr("app.database.async_session", broken_session)

    await cache.set("fallback_key", "fallback_value")

    # インメモリには保存されている
    assert cache.get("fallback_key") == "fallback_value"


@pytest.mark.asyncio
async def test_cache_init_db_failure_keeps_empty(monkeypatch):
    """init() でDB読み込み失敗時は空dictで動作する"""
    class _BrokenSessionCtx:
        async def __aenter__(self):
            raise RuntimeError("DB connection failed")
        async def __aexit__(self, *args):
            pass

    def broken_session():
        return _BrokenSessionCtx()

    monkeypatch.setattr("app.database.async_session", broken_session)

    cache = TranslationCache()
    await cache.init()

    assert cache.get("anything") is None
    assert cache.contains("anything") is False
