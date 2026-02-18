"""
データモデル定義
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class HealthResponse(BaseModel):
    """ヘルスチェックレスポンス"""
    status: str
    service: str
    version: str
    timestamp: str


class EarthquakeInfo(BaseModel):
    """地震情報"""
    id: str
    time: str
    location: str
    location_translated: Optional[str] = None
    magnitude: float
    max_intensity: str  # 最大震度
    max_intensity_translated: Optional[str] = None
    depth: int  # 震源の深さ（km）
    latitude: float
    longitude: float
    tsunami_warning: str  # 津波警報の有無
    tsunami_warning_translated: Optional[str] = None
    message: str
    message_translated: Optional[str] = None
    source: str = "気象庁"


class WeatherInfo(BaseModel):
    """天気情報"""
    area: str
    area_code: str
    publishing_office: str
    report_datetime: str
    headline: Optional[str] = None
    text: str
    text_translated: Optional[str] = None


class DisasterAlert(BaseModel):
    """災害警報・注意報"""
    id: str
    type: str  # warning, advisory, etc.
    title: str
    title_translated: Optional[str] = None
    description: str
    description_translated: Optional[str] = None
    area: str
    issued_at: str
    expires_at: Optional[str] = None
    severity: str  # low, medium, high, extreme
    action: Optional[str] = None  # 推奨行動（AI生成）


class TranslatedMessage(BaseModel):
    """翻訳結果"""
    original: str
    translated: str
    source_lang: str
    target_lang: str


class ShelterInfo(BaseModel):
    """避難所情報"""
    id: str
    name: str
    name_translated: Optional[str] = None
    address: str
    latitude: float
    longitude: float
    distance: Optional[float] = None  # 現在地からの距離（km）
    capacity: Optional[int] = None
    current_occupancy: Optional[int] = None
    facilities: list[str] = []  # バリアフリー、ペット可、等
    is_open: bool = True
    phone: Optional[str] = None
    types: list[str] = []  # 地震、津波、洪水、等


class UserLocation(BaseModel):
    """ユーザー位置情報"""
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    timestamp: Optional[str] = None


class NotificationPreference(BaseModel):
    """通知設定"""
    user_id: str
    language: str = "ja"
    earthquake_threshold: int = 3  # この震度以上で通知
    weather_alerts: bool = True
    tsunami_alerts: bool = True
    areas: list[str] = []  # 監視対象地域


class TsunamiInfo(BaseModel):
    """津波情報"""
    id: str
    event_id: str  # 地震イベントID
    title: str
    title_en: Optional[str] = None
    report_datetime: str
    earthquake_time: Optional[str] = None
    earthquake_location: str
    earthquake_location_en: Optional[str] = None
    magnitude: Optional[str] = None
    coordinates: Optional[str] = None  # 緯度経度
    warning_level: str  # none, advisory, warning, major_warning
    areas: list[dict] = []  # 影響を受ける地域
    message: str
    message_translated: Optional[str] = None


class VolcanoInfo(BaseModel):
    """火山情報"""
    code: int
    name: str
    name_en: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    alert_level: Optional[int] = None  # 噴火警戒レベル（1-5）
    alert_level_text: Optional[str] = None
    is_monitored: bool = False  # 常時観測火山かどうか
    last_updated: Optional[str] = None
    message: Optional[str] = None
    message_translated: Optional[str] = None


class VolcanoWarning(BaseModel):
    """火山警報"""
    volcano_code: int
    volcano_name: Optional[str] = None
    alert_level: int
    alert_level_name: str
    severity: str  # low, medium, high, extreme
    action: str  # 推奨される行動
    issued_at: str
    headline: Optional[str] = None


class SafetyGuide(BaseModel):
    """安全ガイド（AI生成）"""
    disaster_type: str  # earthquake, tsunami, flood, typhoon, volcano, etc.
    disaster_type_translated: Optional[str] = None
    severity: str  # low, medium, high, extreme
    location: Optional[str] = None
    location_translated: Optional[str] = None
    language: str
    title: str  # ガイドのタイトル
    summary: str  # 簡潔な要約（1-2文）
    immediate_actions: list[str]  # 即時行動リスト
    preparation_tips: list[str]  # 事前準備のヒント
    evacuation_info: Optional[str] = None  # 避難に関する情報
    emergency_contacts: Optional[str] = None  # 緊急連絡先
    additional_notes: Optional[str] = None  # 補足情報
    generated_at: str  # 生成日時
    cached: bool = False  # キャッシュから取得したかどうか
