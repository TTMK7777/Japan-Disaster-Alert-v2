"""
Web Push通知サービス

VAPID認証によるWeb Push通知の送信・サブスクリプション管理を行う。
サブスクリプションはJSONファイルに保存（Phase 2でDB移行予定）。
"""
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..config import settings
from ..exceptions import PushNotificationError
from ..models import PushSubscription
from ..utils.logger import get_logger

logger = get_logger(__name__)

# pywebpush のインポート（オプショナル依存）
try:
    from pywebpush import webpush, WebPushException
    PYWEBPUSH_AVAILABLE = True
except ImportError:
    PYWEBPUSH_AVAILABLE = False
    logger.warning("pywebpush がインストールされていません。プッシュ通知の送信は無効です。")


class PushNotificationService:
    """Web Push通知サービス"""

    def __init__(self):
        self._subscriptions_path = settings.push_subscriptions_path
        self._vapid_public_key = settings.vapid_public_key
        self._vapid_private_key = settings.vapid_private_key
        self._vapid_claims_email = settings.vapid_claims_email
        self._subscriptions: list[dict] = []
        self._lock = asyncio.Lock()
        self._load_subscriptions()

    @property
    def is_enabled(self) -> bool:
        """プッシュ通知が利用可能かどうか"""
        return bool(
            PYWEBPUSH_AVAILABLE
            and self._vapid_public_key
            and self._vapid_private_key
            and self._vapid_claims_email
        )

    def _load_subscriptions(self) -> None:
        """JSONファイルからサブスクリプションをロード"""
        if self._subscriptions_path.exists():
            try:
                with open(self._subscriptions_path, "r", encoding="utf-8") as f:
                    self._subscriptions = json.load(f)
                logger.info(f"サブスクリプション読み込み: {len(self._subscriptions)}件")
            except (json.JSONDecodeError, OSError) as e:
                logger.error(f"サブスクリプション読み込みエラー: {e}")
                self._subscriptions = []
        else:
            self._subscriptions = []

    def _save_subscriptions(self) -> None:
        """サブスクリプションをJSONファイルに保存"""
        try:
            self._subscriptions_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self._subscriptions_path, "w", encoding="utf-8") as f:
                json.dump(self._subscriptions, f, ensure_ascii=False, indent=2)
        except OSError as e:
            logger.error(f"サブスクリプション保存エラー: {e}")
            raise PushNotificationError(f"サブスクリプション保存に失敗しました: {e}")

    async def subscribe(self, subscription: PushSubscription) -> bool:
        """
        サブスクリプションを登録

        Args:
            subscription: Web Push サブスクリプション情報

        Returns:
            bool: 登録成功時True
        """
        async with self._lock:
            # 既存のサブスクリプションを確認（重複防止）
            for existing in self._subscriptions:
                if existing.get("endpoint") == subscription.endpoint:
                    # キーを更新
                    existing["keys"] = subscription.keys
                    self._save_subscriptions()
                    logger.info(f"サブスクリプション更新: {subscription.endpoint[:50]}...")
                    return True

            # 新規登録
            self._subscriptions.append({
                "endpoint": subscription.endpoint,
                "keys": subscription.keys,
                "subscribed_at": datetime.now().isoformat(),
            })
            self._save_subscriptions()
            logger.info(f"サブスクリプション登録: {subscription.endpoint[:50]}... (合計: {len(self._subscriptions)}件)")
            return True

    async def unsubscribe(self, endpoint: str) -> bool:
        """
        サブスクリプションを解除

        Args:
            endpoint: 解除するエンドポイントURL

        Returns:
            bool: 解除成功時True（存在しない場合はFalse）
        """
        async with self._lock:
            original_count = len(self._subscriptions)
            self._subscriptions = [
                s for s in self._subscriptions
                if s.get("endpoint") != endpoint
            ]

            if len(self._subscriptions) < original_count:
                self._save_subscriptions()
                logger.info(f"サブスクリプション解除: {endpoint[:50]}... (残り: {len(self._subscriptions)}件)")
                return True

            logger.warning(f"サブスクリプション未検出: {endpoint[:50]}...")
            return False

    async def send_notification(
        self,
        title: str,
        body: str,
        url: str = "/",
        subscription: Optional[PushSubscription] = None,
    ) -> int:
        """
        プッシュ通知を送信

        Args:
            title: 通知タイトル
            body: 通知本文
            url: クリック時のURL
            subscription: 個別送信先（未指定時は全登録者に送信）

        Returns:
            int: 送信成功数

        Raises:
            PushNotificationError: VAPID未設定またはpywebpush未インストール時
        """
        if not self.is_enabled:
            if not PYWEBPUSH_AVAILABLE:
                raise PushNotificationError(
                    "pywebpush がインストールされていません。"
                    "'pip install pywebpush' を実行してください。"
                )
            raise PushNotificationError(
                "VAPID鍵が設定されていません。"
                "環境変数 VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIMS_EMAIL を設定してください。"
            )

        payload = json.dumps({
            "title": title,
            "body": body,
            "url": url,
            "tag": "disaster-alert",
            "icon": "/icons/icon-192x192.png",
            "badge": "/icons/badge-72x72.png",
        }, ensure_ascii=False)

        vapid_claims = {
            "sub": f"mailto:{self._vapid_claims_email}",
        }

        targets: list[dict] = []
        if subscription:
            targets = [{
                "endpoint": subscription.endpoint,
                "keys": subscription.keys,
            }]
        else:
            targets = self._subscriptions.copy()

        if not targets:
            logger.warning("送信先のサブスクリプションがありません")
            return 0

        sent_count = 0
        failed_endpoints: list[str] = []

        for sub_info in targets:
            try:
                # webpush() は同期関数のため、to_thread でイベントループブロックを回避
                await asyncio.to_thread(
                    webpush,
                    subscription_info={
                        "endpoint": sub_info["endpoint"],
                        "keys": sub_info["keys"],
                    },
                    data=payload,
                    vapid_private_key=self._vapid_private_key,
                    vapid_claims=vapid_claims,
                )
                sent_count += 1
            except WebPushException as e:
                status_code = getattr(e, "response", None)
                if status_code and hasattr(status_code, "status_code"):
                    sc = status_code.status_code
                    if sc in (404, 410):
                        # サブスクリプションが無効（ブラウザ側で解除済み）
                        failed_endpoints.append(sub_info["endpoint"])
                        logger.info(f"無効なサブスクリプション削除: {sub_info['endpoint'][:50]}...")
                        continue
                logger.error(f"プッシュ送信エラー: {e}")
            except Exception as e:
                logger.error(f"予期せぬプッシュ送信エラー: {e}")

        # 無効なサブスクリプションを削除
        if failed_endpoints:
            async with self._lock:
                self._subscriptions = [
                    s for s in self._subscriptions
                    if s.get("endpoint") not in failed_endpoints
                ]
                self._save_subscriptions()
            logger.info(f"無効なサブスクリプション{len(failed_endpoints)}件を削除")

        logger.info(f"プッシュ通知送信完了: {sent_count}/{len(targets)}件成功")
        return sent_count

    async def send_disaster_alert(
        self,
        alert_type: str,
        message: str,
        severity: str,
        lang: str = "ja",
    ) -> int:
        """
        災害アラート通知を全登録者に送信

        Args:
            alert_type: 災害種別（earthquake, tsunami, flood等）
            message: 通知メッセージ
            severity: 重要度（low, medium, high, extreme）
            lang: 言語コード

        Returns:
            int: 送信成功数
        """
        # 災害種別に応じたタイトル生成
        alert_titles = {
            "ja": {
                "earthquake": "地震情報",
                "tsunami": "津波警報",
                "flood": "洪水警報",
                "typhoon": "台風情報",
                "volcano": "噴火警報",
                "landslide": "土砂災害警戒",
                "fire": "火災情報",
            },
            "en": {
                "earthquake": "Earthquake Alert",
                "tsunami": "Tsunami Warning",
                "flood": "Flood Warning",
                "typhoon": "Typhoon Alert",
                "volcano": "Volcanic Alert",
                "landslide": "Landslide Warning",
                "fire": "Fire Alert",
            },
        }

        titles = alert_titles.get(lang, alert_titles["en"])
        title = titles.get(alert_type, f"災害情報 / Disaster Alert")

        # 重要度に応じてタイトルにプレフィックスを付与
        severity_prefix = {
            "extreme": "[緊急] " if lang == "ja" else "[EMERGENCY] ",
            "high": "[警報] " if lang == "ja" else "[WARNING] ",
            "medium": "[注意] " if lang == "ja" else "[ADVISORY] ",
            "low": "",
        }
        title = severity_prefix.get(severity, "") + title

        return await self.send_notification(
            title=title,
            body=message,
            url=f"/?alert={alert_type}",
        )

    def get_subscription_count(self) -> int:
        """登録中のサブスクリプション数を取得"""
        return len(self._subscriptions)
