"""
翻訳キャッシュ管理

ファイルベースのJSON永続化キャッシュ。
MD5ハッシュキーによる高速ルックアップ。
"""
import hashlib
import json
from pathlib import Path
from typing import Optional

from ..utils.logger import get_logger

logger = get_logger(__name__)


class TranslationCache:
    """ファイルベース翻訳キャッシュ"""

    def __init__(self, cache_file: Path):
        """
        初期化

        Args:
            cache_file: キャッシュファイルのパス
        """
        self._cache: dict[str, str] = {}
        self._cache_file = cache_file
        self._load()

    def _load(self) -> None:
        """キャッシュをファイルから読み込み"""
        try:
            if self._cache_file.exists():
                with open(self._cache_file, "r", encoding="utf-8") as f:
                    self._cache = json.load(f)
        except Exception as e:
            logger.error(f"キャッシュ読み込みエラー: {e}", exc_info=True)
            self._cache = {}

    def _save(self) -> None:
        """キャッシュをファイルに保存"""
        try:
            self._cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._cache_file, "w", encoding="utf-8") as f:
                json.dump(self._cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"キャッシュ保存エラー: {e}", exc_info=True)

    @staticmethod
    def make_key(text: str, target_lang: str) -> str:
        """
        キャッシュキーを生成（MD5ハッシュ）

        Args:
            text: 元テキスト
            target_lang: 翻訳先言語コード

        Returns:
            MD5ハッシュ文字列
        """
        return hashlib.md5(f"{text}:{target_lang}".encode()).hexdigest()

    def get(self, key: str) -> Optional[str]:
        """
        キャッシュから値を取得

        Args:
            key: キャッシュキー

        Returns:
            キャッシュされた値、存在しない場合はNone
        """
        return self._cache.get(key)

    def set(self, key: str, value: str) -> None:
        """
        キャッシュに値を保存（ファイルにも永続化）

        Args:
            key: キャッシュキー
            value: 保存する値
        """
        self._cache[key] = value
        self._save()

    def contains(self, key: str) -> bool:
        """
        キャッシュにキーが存在するか確認

        Args:
            key: キャッシュキー

        Returns:
            存在する場合True
        """
        return key in self._cache
