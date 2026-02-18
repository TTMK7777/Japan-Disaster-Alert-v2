"""
アプリケーション設定

環境変数から設定を読み込み、アプリケーション全体で使用する設定を管理します。
.envファイルまたは環境変数で設定をオーバーライドできます。
"""
import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """アプリケーション設定"""
    
    # 環境設定
    environment: str = "development"
    log_level: str = "INFO"
    
    # API設定
    api_timeout: float = 10.0
    ai_timeout_translate: float = 15.0
    ai_timeout_generate: float = 30.0
    
    # 気象庁API
    jma_base_url: str = "https://www.jma.go.jp/bosai"
    
    # P2P地震情報API
    p2p_base_url: str = "https://api.p2pquake.net/v2"
    
    # Claude API
    anthropic_api_key: Optional[str] = None
    anthropic_api_version: str = "2023-06-01"
    anthropic_model: str = "claude-3-haiku-20240307"

    # Gemini API
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.0-flash-exp"

    # 使用するAIプロバイダー（claude, gemini, auto）
    # auto: Gemini優先、なければClaude
    ai_provider: str = "auto"
    
    # レート制限設定
    rate_limit_general: str = "60/minute"
    rate_limit_translate: str = "20/minute"
    rate_limit_safety_guide: str = "10/minute"

    # リクエストサイズ制限
    max_content_size: int = 1_048_576  # 1MB
    max_translate_text_length: int = 5000  # 文字数

    # CORS設定
    allowed_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:8000"
    
    # キャッシュ設定
    cache_dir: Path = Path(__file__).parent.parent / "data"
    translation_cache_file: Path = Path(__file__).parent.parent / "data" / "translation_cache.json"
    shelter_data_dir: Path = Path(__file__).parent.parent / "data" / "shelters"
    
    # サーバー設定
    host: str = "0.0.0.0"
    port: int = 8000
    timeout_keep_alive: int = 30
    limit_concurrency: int = 100
    
    @property
    def reload(self) -> bool:
        """開発環境でのみリロードを有効化"""
        return self.environment != "production"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# グローバル設定インスタンス
settings = Settings()

