"""
統一ロガーモジュール

開発環境: プレーンテキスト形式（人間が読みやすい）
本番環境: JSON形式（ログ集約・分析に最適化）
"""
import logging
import os
from typing import Optional

from pythonjsonlogger.json import JsonFormatter


def _is_production() -> bool:
    return os.getenv("ENVIRONMENT") == "production"


def _create_formatter() -> logging.Formatter:
    """環境に応じたフォーマッタを生成"""
    if _is_production():
        return JsonFormatter(
            fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
            rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        )
    return logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """
    統一されたロガーを取得

    Args:
        name: ロガー名（通常は__name__）
        level: ログレベル（指定がない場合は環境変数から取得）

    Returns:
        logging.Logger: 設定済みのロガー
    """
    logger = logging.getLogger(name)

    # 既にハンドラーが設定されている場合はそのまま返す
    if logger.handlers:
        return logger

    # ログレベルの決定
    if level:
        log_level = getattr(logging, level.upper(), logging.INFO)
    else:
        env_level = os.getenv("LOG_LEVEL", "INFO")
        log_level = getattr(logging, env_level.upper(), logging.INFO)

        # 本番環境ではWARNING以上のみ
        if _is_production():
            log_level = logging.WARNING

    # ハンドラーの設定
    handler = logging.StreamHandler()
    handler.setFormatter(_create_formatter())
    logger.addHandler(handler)
    logger.setLevel(log_level)

    return logger
