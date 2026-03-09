"""
アプリケーション設定

環境変数から設定を読み込み、アプリケーション全体で使用する設定を管理します。
.envファイルまたは環境変数で設定をオーバーライドできます。
"""
import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    anthropic_model: str = "claude-haiku-4-5-20251001"

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

    # CORS設定（環境変数 CORS_ORIGINS で上書き可能、カンマ区切り）
    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    
    # データベース設定（SQLite: 開発 / PostgreSQL: 本番）
    database_url: str = f"sqlite+aiosqlite:///{Path(__file__).parent.parent / 'data' / 'app.db'}"

    # キャッシュ設定
    cache_dir: Path = Path(__file__).parent.parent / "data"
    translation_cache_file: Path = Path(__file__).parent.parent / "data" / "translation_cache.json"
    shelter_data_dir: Path = Path(__file__).parent.parent / "data" / "shelters"
    shelter_csv_path: str = ""  # 国土地理院CSVファイルパス（空の場合はサンプルデータを使用）

    # プッシュ通知設定（VAPID）
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_claims_email: str = ""
    push_subscriptions_path: Path = Path(__file__).parent.parent / "data" / "push_subscriptions.json"
    
    # サーバー設定
    host: str = "0.0.0.0"
    port: int = 8000
    timeout_keep_alive: int = 30
    limit_concurrency: int = 100
    
    @property
    def reload(self) -> bool:
        """開発環境でのみリロードを有効化"""
        return self.environment != "production"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


# グローバル設定インスタンス
settings = Settings()

# 起動時にAPIキー未設定を警告
import logging as _logging

_config_logger = _logging.getLogger(__name__)
if not settings.anthropic_api_key and not settings.gemini_api_key:
    _config_logger.warning(
        "ANTHROPIC_API_KEY / GEMINI_API_KEY が両方とも未設定です。AI翻訳・生成機能は利用できません。"
    )

# 本番環境でCORSがlocalhostのみの場合に警告
if settings.environment == "production":
    _cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if all("localhost" in o or "127.0.0.1" in o for o in _cors_origins):
        _config_logger.warning(
            "本番環境でCORS許可オリジンがlocalhostのみです。"
            "環境変数 CORS_ORIGINS に本番ドメインを設定してください。"
        )

