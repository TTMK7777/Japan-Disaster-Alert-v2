"""
カスタム例外クラス
"""
from typing import Optional


class DisasterAlertError(Exception):
    """災害情報エラーの基底クラス"""
    pass


class APIError(DisasterAlertError):
    """APIエラー"""
    def __init__(self, message: str, status_code: int = 500, original_error: Optional[Exception] = None):
        self.message = message
        self.status_code = status_code
        self.original_error = original_error
        super().__init__(self.message)


class TranslationError(DisasterAlertError):
    """翻訳エラー"""
    pass


class ServiceError(DisasterAlertError):
    """サービスエラー"""
    pass


class ValidationError(DisasterAlertError):
    """バリデーションエラー"""
    pass


class PushNotificationError(DisasterAlertError):
    """プッシュ通知エラー"""
    pass



class UpstreamUnavailableError(ServiceError):
    """上流（気象庁・P2P）から取得できず、使える値も無い。

    「取得できなかった」を空リストにすると、画面は「警報なし」「地震なし」と読める。
    呼び出し側（エンドポイント）はこれを 503 にする。
    """
    pass
