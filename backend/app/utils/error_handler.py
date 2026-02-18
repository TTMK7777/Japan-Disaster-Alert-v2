"""
エラーハンドリングユーティリティ

統一されたエラーハンドリングを提供するデコレータを定義します。
すべてのエンドポイントで一貫したエラー処理を実現します。
"""
import os
from functools import wraps
from fastapi import HTTPException
from typing import Callable, Any

from ..exceptions import DisasterAlertError, APIError
from ..config import settings
from .logger import get_logger

logger = get_logger(__name__)


def handle_errors(func: Callable) -> Callable:
    """
    エラーハンドリングデコレータ
    
    エンドポイント関数に適用することで、統一されたエラーハンドリングを提供します。
    非同期関数と同期関数の両方に対応します。
    
    Usage:
        @app.get("/api/v1/example")
        @handle_errors
        async def example_endpoint():
            # 処理
            pass
    """
    import inspect
    
    def _handle_exception(e: Exception) -> None:
        """例外を処理してHTTPExceptionを発生させる"""
        is_production = settings.environment == "production"
        
        if isinstance(e, HTTPException):
            raise
        elif isinstance(e, DisasterAlertError):
            logger.error(f"カスタムエラー発生: {str(e)}", exc_info=True)
            if isinstance(e, APIError):
                raise HTTPException(
                    status_code=e.status_code,
                    detail=e.message if not is_production else "内部サーバーエラーが発生しました"
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=str(e) if not is_production else "内部サーバーエラーが発生しました"
                )
        else:
            logger.error(f"エラー発生: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=str(e) if not is_production else "内部サーバーエラーが発生しました"
            )
    
    if inspect.iscoroutinefunction(func):
        # 非同期関数の場合
        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                _handle_exception(e)
        return async_wrapper
    else:
        # 同期関数の場合
        @wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                _handle_exception(e)
        return sync_wrapper

