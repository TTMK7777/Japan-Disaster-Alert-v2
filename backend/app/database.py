"""
データベース接続管理

SQLAlchemy (async) によるDB接続。
開発: SQLite (aiosqlite)
本番: PostgreSQL (asyncpg) に切替可能。
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings
from .utils.logger import get_logger

logger = get_logger(__name__)


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.database_url,
    echo=settings.environment == "development",
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    """テーブルを作成（存在しない場合のみ）"""
    from . import db_models  # noqa: F401 — テーブル定義を読み込む

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("データベース初期化完了")


async def close_db() -> None:
    """エンジンを閉じる"""
    await engine.dispose()
    logger.info("データベース接続を閉じました")
