"""
データベース接続管理

SQLAlchemy (async) によるDB接続。
開発: SQLite (aiosqlite)
本番: PostgreSQL (asyncpg) に切替可能。
"""
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
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


async def _ensure_management_token_column() -> None:
    """既存DBに management_token カラムを idempotent に追加する

    Alembic 未使用のため、startup 時に raw SQL で軽量マイグレーションを行う。
    SQLite/PostgreSQL どちらでも動作する形式 (ADD COLUMN は両者共通)。
    既に追加済みの場合は OperationalError/ProgrammingError を握りつぶす。
    """
    async with async_session() as session:
        try:
            await session.execute(text(
                "ALTER TABLE push_subscriptions ADD COLUMN management_token VARCHAR(64)"
            ))
            await session.commit()
            logger.info("push_subscriptions.management_token カラム追加")
        except (OperationalError, ProgrammingError):
            await session.rollback()  # 既に存在 → 無視
        try:
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_push_subscriptions_management_token "
                "ON push_subscriptions (management_token)"
            ))
            await session.commit()
        except (OperationalError, ProgrammingError):
            await session.rollback()


async def init_db() -> None:
    """テーブルを作成（存在しない場合のみ）"""
    from . import db_models  # noqa: F401 — テーブル定義を読み込む

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 既存DB向けの軽量マイグレーション (management_token カラム)
    await _ensure_management_token_column()

    logger.info("データベース初期化完了")


async def close_db() -> None:
    """エンジンを閉じる"""
    await engine.dispose()
    logger.info("データベース接続を閉じました")
