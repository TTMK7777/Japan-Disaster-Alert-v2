"""
翻訳キャッシュ管理

L1: インメモリdict（高速読み取り）
L2: SQLAlchemy DB（永続化）

読み取り（get / contains）は同期でインメモリdictを参照。
書き込み（set）は非同期でインメモリdict + DBに保存。
起動時に init() でDBからインメモリdictを復元。
"""
import hashlib
from typing import Optional

from sqlalchemy import select

from ..utils.logger import get_logger

logger = get_logger(__name__)


class TranslationCache:
    """DB永続化翻訳キャッシュ（L1: dict / L2: DB）"""

    def __init__(self) -> None:
        """初期化（インメモリdictのみ。DB読み込みは init() で行う）"""
        self._cache: dict[str, str] = {}

    async def init(self) -> None:
        """DBからキャッシュを復元する（起動時に1回呼び出す）"""
        try:
            from ..database import async_session
            from ..db_models import TranslationCacheRow

            async with async_session() as session:
                result = await session.execute(select(TranslationCacheRow))
                rows = result.scalars().all()
                for row in rows:
                    self._cache[row.cache_key] = row.value
            logger.info("翻訳キャッシュをDBから復元: %d件", len(self._cache))
        except Exception as e:
            logger.warning("DB読み込み失敗（インメモリのみで動作）: %s", e)

    @staticmethod
    def make_key(text: str, target_lang: str) -> str:
        """
        キャッシュキーを生成（SHA-256ハッシュ）

        Args:
            text: 元テキスト
            target_lang: 翻訳先言語コード

        Returns:
            SHA-256ハッシュ文字列
        """
        return hashlib.sha256(f"{text}:{target_lang}".encode()).hexdigest()

    def get(self, key: str) -> Optional[str]:
        """
        キャッシュから値を取得（同期 — インメモリdictを参照）

        Args:
            key: キャッシュキー

        Returns:
            キャッシュされた値、存在しない場合はNone
        """
        return self._cache.get(key)

    async def set(self, key: str, value: str) -> None:
        """
        キャッシュに値を保存（インメモリdict + DB）

        Args:
            key: キャッシュキー
            value: 保存する値
        """
        # L1: インメモリdictに即時保存
        self._cache[key] = value

        # L2: DBに永続化
        try:
            from ..database import async_session
            from ..db_models import TranslationCacheRow

            async with async_session() as session:
                # UPSERT: 既存キーなら更新、なければ挿入
                existing = await session.execute(
                    select(TranslationCacheRow).where(TranslationCacheRow.cache_key == key)
                )
                row = existing.scalar_one_or_none()
                if row:
                    row.value = value
                else:
                    session.add(TranslationCacheRow(cache_key=key, value=value))
                await session.commit()
        except Exception as e:
            logger.warning("DB書き込み失敗（インメモリには保存済み）: %s", e)

    def contains(self, key: str) -> bool:
        """
        キャッシュにキーが存在するか確認（同期 — インメモリdictを参照）

        Args:
            key: キャッシュキー

        Returns:
            存在する場合True
        """
        return key in self._cache
