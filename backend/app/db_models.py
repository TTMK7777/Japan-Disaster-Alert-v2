"""
SQLAlchemy テーブル定義
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class PushSubscriptionRow(Base):
    """Web Push サブスクリプション"""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    endpoint: Mapped[str] = mapped_column(String(2048), unique=True, index=True)
    key_p256dh: Mapped[str] = mapped_column(String(512))
    key_auth: Mapped[str] = mapped_column(String(512))
    subscribed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # 地域セグメント・通知設定
    language: Mapped[str] = mapped_column(String(10), default="ja")
    preferred_regions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: ["130000","270000"]
    earthquake_threshold: Mapped[int] = mapped_column(Integer, default=3)  # この震度以上で通知
    tsunami_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    weather_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class TranslationCacheRow(Base):
    """翻訳キャッシュ"""

    __tablename__ = "translation_cache"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cache_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_translation_cache_key", "cache_key"),
    )
