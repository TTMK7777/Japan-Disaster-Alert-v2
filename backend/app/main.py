"""
災害対応AIエージェントシステム - バックエンドAPI
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from datetime import datetime
from typing import Optional

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .config import settings
from .utils.logger import get_logger
from .utils.error_handler import handle_errors

logger = get_logger(__name__)

from .models import (
    EarthquakeInfo,
    WeatherInfo,
    DisasterAlert,
    HealthResponse,
    TranslatedMessage,
    ShelterInfo,
    TsunamiInfo,
    VolcanoInfo,
    VolcanoWarning,
    SafetyGuide,
    PushSubscription,
    PushUnsubscribeRequest,
    PushTestRequest,
    PushNotificationResponse,
)
from .services.jma_service import JMAService
from .services.p2p_service import P2PQuakeService
from .services.translator import TranslatorService
from .services.warning_service import WarningService
from .services.tsunami_service import TsunamiService
from .services.volcano_service import VolcanoService
from .services.shelter_service import ShelterService
from .services.push_service import PushNotificationService

# サービスインスタンス
jma_service = JMAService()
p2p_service = P2PQuakeService()
translator = TranslatorService()
warning_service = WarningService()
tsunami_service = TsunamiService()
volcano_service = VolcanoService()
shelter_service = ShelterService()
push_service = PushNotificationService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションのライフサイクル管理"""
    # 起動時
    logger.info("災害対応AIシステム起動中...")
    yield
    # 終了時: リソース解放
    await translator.close()
    logger.info("災害対応AIシステム終了")


# レート制限（インメモリストレージ、単一プロセス用）
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="災害対応AIエージェントAPI",
    description="多言語対応の災害情報提供システム",
    version="1.0.0",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# SlowAPIミドルウェア（CORSより前に記述 = 内側で実行、OPTIONSプリフライトが429にならない）
app.add_middleware(SlowAPIMiddleware)

# CORS設定（環境変数 CORS_ORIGINS で制御）
# 本番環境では環境変数 CORS_ORIGINS で許可オリジンを指定すること
# 例: CORS_ORIGINS=http://localhost:3000,https://example.com
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in settings.cors_origins.split(",")
    if origin.strip()  # 空文字列を除外
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,  # 環境変数で制限
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],  # 必要なメソッドのみ許可
    allow_headers=["Content-Type", "Authorization"],  # 必要なヘッダーのみ許可
)


# セキュリティヘッダーミドルウェア
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """セキュリティヘッダーを追加するミドルウェア"""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # セキュリティヘッダーの追加
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # HTTPSを強制（本番環境のみ）
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response

app.add_middleware(SecurityHeadersMiddleware)


# リクエストサイズ制限ミドルウェア
class ContentSizeLimitMiddleware(BaseHTTPMiddleware):
    """リクエストボディのサイズを制限するミドルウェア"""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > settings.max_content_size:
                    return Response(
                        content="Request body too large",
                        status_code=413,
                    )
            except ValueError:
                return Response(
                    content="Invalid content-length header",
                    status_code=400,
                )
        return await call_next(request)

app.add_middleware(ContentSizeLimitMiddleware)


@app.get("/", response_model=HealthResponse)
@limiter.exempt
async def root():
    """ヘルスチェック"""
    return HealthResponse(
        status="healthy",
        service="災害対応AIエージェント",
        version="1.0.0",
        timestamp=datetime.now().isoformat()
    )


@app.get("/api/v1/earthquakes", response_model=list[EarthquakeInfo])
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_earthquakes(request: Request, limit: int = 10, lang: str = "ja"):
    """
    最新の地震情報を取得

    - **limit**: 取得件数（デフォルト: 10）
    - **lang**: 言語コード（ja, en, zh, ko, vi, ne, easy_ja）
    """
    earthquakes = await p2p_service.get_recent_earthquakes(limit=limit)

    # 多言語翻訳（ハイブリッド方式）
    if lang != "ja":
        for eq in earthquakes:
            # 震源地名翻訳（静的マッピング → Claude API → キャッシュ）
            eq.location_translated = await translator.translate_location(
                eq.location, target_lang=lang
            )
            # 震度翻訳（静的マッピング）
            eq.max_intensity_translated = translator.translate_intensity(
                eq.max_intensity, target_lang=lang
            )
            # 津波警報翻訳（静的マッピング）
            eq.tsunami_warning_translated = translator.translate_tsunami_warning(
                eq.tsunami_warning, target_lang=lang
            )
            # メッセージ生成（translator.pyのメソッドを使用）
            eq.message_translated = translator.generate_earthquake_message(
                lang=lang,
                location=eq.location_translated,
                magnitude=eq.magnitude,
                intensity=eq.max_intensity,
                depth=eq.depth,
                tsunami_warning=eq.tsunami_warning,
                tsunami_warning_translated=eq.tsunami_warning_translated
            )

    return earthquakes


@app.get("/api/v1/weather/{area_code}", response_model=WeatherInfo)
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_weather(request: Request, area_code: str, lang: str = "ja"):
    """
    指定地域の天気情報を取得

    - **area_code**: 地域コード（例: 130000=東京都）
    - **lang**: 言語コード
    """
    weather = await jma_service.get_weather_forecast(area_code)

    # 多言語翻訳
    if lang != "ja" and weather:
        weather.text_translated = await translator.translate(
            weather.text, target_lang=lang
        )

    return weather


@app.get("/api/v1/alerts", response_model=list[DisasterAlert])
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_alerts(request: Request, area_code: str = "130000", lang: str = "ja"):
    """
    現在発令中の警報・注意報を取得

    - **area_code**: 地域コード（例: 130000=東京都）
    - **lang**: 言語コード（ja, en, zh, ko, vi, easy_ja）
    """
    # 警報サービスに多言語翻訳が組み込まれているため直接取得
    alerts = await warning_service.get_warnings(area_code, lang)
    return alerts


@app.get("/api/v1/warnings/special", response_model=list[DisasterAlert])
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_special_warnings(request: Request, lang: str = "ja"):
    """
    全国の特別警報を取得

    - **lang**: 言語コード
    """
    alerts = await warning_service.get_special_warnings()

    if lang != "ja":
        for alert in alerts:
            alert.title_translated = await translator.translate(
                alert.title, target_lang=lang
            )
            alert.description_translated = await translator.translate(
                alert.description, target_lang=lang
            )

    return alerts


@app.post("/api/v1/translate", response_model=TranslatedMessage)
@handle_errors
@limiter.limit(settings.rate_limit_translate)
async def translate_message(request: Request, text: str, target_lang: str = "en"):
    """
    テキストを指定言語に翻訳

    - **text**: 翻訳するテキスト（最大5000文字）
    - **target_lang**: 翻訳先言語コード
    """
    if len(text) > settings.max_translate_text_length:
        raise HTTPException(
            status_code=400,
            detail=f"テキストが長すぎます。最大{settings.max_translate_text_length}文字です。"
        )
    translated = await translator.translate(text, target_lang)
    return TranslatedMessage(
        original=text,
        translated=translated,
        source_lang="ja",
        target_lang=target_lang
    )


@app.get("/api/v1/shelters", response_model=list[ShelterInfo])
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_nearby_shelters(
    request: Request,
    lat: float,
    lon: float,
    radius: float = 5.0,
    limit: int = 20,
    disaster_type: Optional[str] = None,
    lang: str = "ja"
):
    """
    現在地周辺の避難所を検索

    - **lat**: 緯度
    - **lon**: 経度
    - **radius**: 検索半径（km）
    - **limit**: 取得件数上限
    - **disaster_type**: 災害種別（earthquake, tsunami, flood等）
    - **lang**: 言語コード
    """
    shelters = shelter_service.get_nearby_shelters(
        lat=lat,
        lon=lon,
        radius_km=radius,
        limit=limit,
        disaster_type=disaster_type
    )

    # 多言語翻訳
    if lang != "ja":
        for shelter in shelters:
            shelter.name_translated = await translator.translate(
                shelter.name, target_lang=lang
            )

    return shelters


@app.get("/api/v1/shelters/types")
@limiter.exempt
async def get_shelter_disaster_types():
    """対応している災害種別一覧を取得"""
    return shelter_service.get_disaster_types()


@app.get("/api/v1/tsunami", response_model=list[TsunamiInfo])
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_tsunami_info(request: Request, limit: int = 10, lang: str = "ja"):
    """
    津波情報を取得

    - **limit**: 取得件数
    - **lang**: 言語コード
    """
    tsunamis = await tsunami_service.get_tsunami_list(limit=limit)

    # 多言語翻訳
    if lang != "ja":
        for tsunami in tsunamis:
            tsunami.message_translated = await translator.translate(
                tsunami.message, target_lang=lang
            )

    return tsunamis


@app.get("/api/v1/tsunami/active", response_model=list[TsunamiInfo])
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_active_tsunami_warnings(request: Request, lang: str = "ja"):
    """
    現在発令中の津波警報・注意報を取得

    - **lang**: 言語コード
    """
    tsunamis = await tsunami_service.get_active_warnings()

    if lang != "ja":
        for tsunami in tsunamis:
            tsunami.message_translated = await translator.translate(
                tsunami.message, target_lang=lang
            )

    return tsunamis


@app.get("/api/v1/volcanoes", response_model=list[VolcanoInfo])
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_volcanoes(request: Request, monitored_only: bool = True):
    """
    火山情報を取得

    - **monitored_only**: 常時観測火山のみ取得（デフォルト: True）
    """
    if monitored_only:
        return await volcano_service.get_monitored_volcanoes()
    else:
        return await volcano_service.get_volcano_list()


@app.get("/api/v1/volcanoes/warnings")
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_volcano_warnings(request: Request, lang: str = "ja"):
    """
    火山警報を取得

    - **lang**: 言語コード
    """
    warnings = await volcano_service.get_volcano_warnings()
    return warnings


@app.get("/api/v1/volcanoes/{volcano_code}", response_model=VolcanoInfo)
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def get_volcano_by_code(request: Request, volcano_code: int):
    """
    特定の火山情報を取得

    - **volcano_code**: 火山コード
    """
    volcano = await volcano_service.get_volcano_by_code(volcano_code)
    if not volcano:
        raise HTTPException(status_code=404, detail="火山が見つかりません")
    return volcano


# 対応言語一覧（15言語 + 日本語）
SUPPORTED_LANGUAGES = {
    "ja": "日本語",
    "en": "English",
    "zh": "简体中文",
    "zh-TW": "繁體中文",
    "ko": "한국어",
    "vi": "Tiếng Việt",
    "th": "ภาษาไทย",
    "id": "Bahasa Indonesia",
    "ms": "Bahasa Melayu",
    "tl": "Filipino",
    "fr": "Français",
    "de": "Deutsch",
    "it": "Italiano",
    "es": "Español",
    "ne": "नेपाली",
    "easy_ja": "やさしい日本語"
}


@app.get("/api/v1/languages")
@limiter.exempt
async def get_supported_languages():
    """対応言語一覧を取得"""
    return SUPPORTED_LANGUAGES


# 対応災害種別
SUPPORTED_DISASTER_TYPES = {
    "earthquake": "地震",
    "tsunami": "津波",
    "flood": "洪水",
    "typhoon": "台風",
    "volcano": "火山噴火",
    "landslide": "土砂災害"
}


@app.get("/api/v1/safety-guide", response_model=SafetyGuide)
@handle_errors
@limiter.limit(settings.rate_limit_safety_guide)
async def get_safety_guide(
    request: Request,
    disaster_type: str,
    lang: str = "ja",
    location: Optional[str] = None,
    severity: str = "medium"
):
    """
    災害種別に応じた安全ガイドを取得（AI生成）

    - **disaster_type**: 災害種別（earthquake, tsunami, flood, typhoon, volcano, landslide）
    - **lang**: 言語コード（16言語対応）
    - **location**: 地域名（オプション、例: Tokyo, 東京）
    - **severity**: 重要度（low, medium, high, extreme）

    例:
    - /api/v1/safety-guide?disaster_type=earthquake&lang=en&severity=high
    - /api/v1/safety-guide?disaster_type=tsunami&lang=th&location=Osaka
    """
    # 災害種別の検証
    if disaster_type not in SUPPORTED_DISASTER_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不正な災害種別です。対応: {', '.join(SUPPORTED_DISASTER_TYPES.keys())}"
        )

    # 重要度の検証
    valid_severities = ["low", "medium", "high", "extreme"]
    if severity not in valid_severities:
        raise HTTPException(
            status_code=400,
            detail=f"不正な重要度です。対応: {', '.join(valid_severities)}"
        )

    # 安全ガイドを生成
    guide_data = await translator.generate_safety_guide(
        disaster_type=disaster_type,
        target_lang=lang,
        location=location,
        severity=severity
    )

    if not guide_data:
        raise HTTPException(status_code=500, detail="安全ガイドの生成に失敗しました")

    # 災害種別の翻訳名を取得
    disaster_type_translated = translator.get_disaster_type_name(disaster_type, lang)

    # 地域名の翻訳（指定されている場合）
    location_translated = None
    if location:
        location_translated = await translator.translate_location(location, lang)

    return SafetyGuide(
        disaster_type=disaster_type,
        disaster_type_translated=disaster_type_translated,
        severity=severity,
        location=location,
        location_translated=location_translated,
        language=lang,
        title=guide_data.get("title", ""),
        summary=guide_data.get("summary", ""),
        immediate_actions=guide_data.get("immediate_actions", []),
        preparation_tips=guide_data.get("preparation_tips", []),
        evacuation_info=guide_data.get("evacuation_info"),
        emergency_contacts=guide_data.get("emergency_contacts"),
        additional_notes=guide_data.get("additional_notes"),
        generated_at=datetime.now().isoformat(),
        cached=guide_data.get("cached", False)
    )


@app.get("/api/v1/safety-guide/types")
@limiter.exempt
async def get_disaster_types():
    """対応災害種別一覧を取得"""
    return SUPPORTED_DISASTER_TYPES


# ========================================
# プッシュ通知エンドポイント
# ========================================

@app.post("/api/v1/push/subscribe", response_model=PushNotificationResponse)
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def push_subscribe(request: Request, subscription: PushSubscription):
    """
    プッシュ通知のサブスクリプションを登録

    - **endpoint**: Push Service のエンドポイントURL
    - **keys**: VAPID認証キー（p256dh, auth）
    """
    if not push_service.is_enabled:
        raise HTTPException(
            status_code=503,
            detail="プッシュ通知サービスは現在利用できません。VAPID鍵が設定されていません。"
        )

    result = await push_service.subscribe(subscription)
    return PushNotificationResponse(
        success=result,
        message="サブスクリプションを登録しました" if result else "サブスクリプション登録に失敗しました",
    )


@app.post("/api/v1/push/unsubscribe", response_model=PushNotificationResponse)
@handle_errors
@limiter.limit(settings.rate_limit_general)
async def push_unsubscribe(request: Request, body: PushUnsubscribeRequest):
    """
    プッシュ通知のサブスクリプションを解除

    - **endpoint**: 解除するエンドポイントURL
    """
    if not push_service.is_enabled:
        raise HTTPException(
            status_code=503,
            detail="プッシュ通知サービスは現在利用できません。VAPID鍵が設定されていません。"
        )

    result = await push_service.unsubscribe(body.endpoint)
    return PushNotificationResponse(
        success=result,
        message="サブスクリプションを解除しました" if result else "指定されたサブスクリプションが見つかりません",
    )


@app.post("/api/v1/push/test", response_model=PushNotificationResponse)
@handle_errors
@limiter.limit("5/minute")
async def push_test(request: Request, body: PushTestRequest):
    """
    テスト通知を送信（開発用）

    - **title**: 通知タイトル（デフォルト: テスト通知）
    - **body**: 通知本文
    - **url**: クリック時のURL
    """
    if settings.environment == "production":
        raise HTTPException(
            status_code=403,
            detail="テスト通知は開発環境でのみ使用できます"
        )

    if not push_service.is_enabled:
        raise HTTPException(
            status_code=503,
            detail="プッシュ通知サービスは現在利用できません。VAPID鍵が設定されていません。"
        )

    sent_count = await push_service.send_notification(
        title=body.title,
        body=body.body,
        url=body.url,
    )
    return PushNotificationResponse(
        success=sent_count > 0,
        message=f"テスト通知を{sent_count}件送信しました",
        sent_count=sent_count,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level.lower(),
        timeout_keep_alive=settings.timeout_keep_alive,
        limit_concurrency=settings.limit_concurrency,
    )
