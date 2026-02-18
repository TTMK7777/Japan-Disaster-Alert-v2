"""
統一ロガーモジュール
"""
import logging
import os
from typing import Optional


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
        if os.getenv("ENVIRONMENT") == "production":
            log_level = logging.WARNING
    
    # ハンドラーの設定
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(log_level)
    
    return logger

