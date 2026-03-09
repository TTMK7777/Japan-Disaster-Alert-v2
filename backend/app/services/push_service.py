"""
Web Push通知サービス

VAPID認証によるWeb Push通知の送信・サブスクリプション管理を行う。
サブスクリプションはSQLAlchemy経由でDBに保存。
地域セグメント通知に対応。
"""
import asyncio
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, delete, func
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..database import async_session
from ..db_models import PushSubscriptionRow
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


VALID_ALERT_TYPES = {"earthquake", "tsunami", "flood", "typhoon", "volcano", "landslide", "fire", "weather"}


class PushNotificationService:
    """Web Push通知サービス"""

    MAX_CONCURRENT_PUSH = 10

    def __init__(self):
        self._vapid_public_key = settings.vapid_public_key
        self._vapid_private_key = settings.vapid_private_key
        self._vapid_claims_email = settings.vapid_claims_email

    @property
    def is_enabled(self) -> bool:
        """プッシュ通知が利用可能かどうか"""
        return bool(
            PYWEBPUSH_AVAILABLE
            and self._vapid_public_key
            and self._vapid_private_key
            and self._vapid_claims_email
        )

    async def subscribe(
        self,
        subscription: PushSubscription,
        language: str = "ja",
        preferred_regions: list[str] | None = None,
        earthquake_threshold: int = 3,
        tsunami_alerts: bool = True,
        weather_alerts: bool = True,
    ) -> bool:
        """
        サブスクリプションを登録

        Args:
            subscription: Web Push サブスクリプション情報
            language: 言語コード（デフォルト: "ja"）
            preferred_regions: 監視対象地域コードリスト（Noneは全国監視）
            earthquake_threshold: 通知対象の最小震度（デフォルト: 3）
            tsunami_alerts: 津波警報を受信するか（デフォルト: True）
            weather_alerts: 気象警報を受信するか（デフォルト: True）

        Returns:
            bool: 登録成功時True
        """
        regions_json = json.dumps(preferred_regions) if preferred_regions else None
        try:
            async with async_session() as session:
                # 既存のサブスクリプションを確認（重複防止）
                stmt = select(PushSubscriptionRow).where(
                    PushSubscriptionRow.endpoint == subscription.endpoint
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    # キーと設定を更新
                    existing.key_p256dh = subscription.keys.get("p256dh", "")
                    existing.key_auth = subscription.keys.get("auth", "")
                    existing.language = language
                    existing.preferred_regions = regions_json
                    existing.earthquake_threshold = earthquake_threshold
                    existing.tsunami_alerts = tsunami_alerts
                    existing.weather_alerts = weather_alerts
                    existing.updated_at = datetime.now(timezone.utc)
                    await session.commit()
                    logger.info(f"サブスクリプション更新: {subscription.endpoint[:50]}...")
                    return True

                # 新規登録
                new_row = PushSubscriptionRow(
                    endpoint=subscription.endpoint,
                    key_p256dh=subscription.keys.get("p256dh", ""),
                    key_auth=subscription.keys.get("auth", ""),
                    language=language,
                    preferred_regions=regions_json,
                    earthquake_threshold=earthquake_threshold,
                    tsunami_alerts=tsunami_alerts,
                    weather_alerts=weather_alerts,
                )
                session.add(new_row)
                try:
                    await session.commit()
                except IntegrityError:
                    # 競合INSERT発生 — 既に登録済みなので成功とみなす
                    await session.rollback()
                    logger.info(f"サブスクリプション競合登録（既存）: {subscription.endpoint[:50]}...")
                    return True
                count = await self.get_subscription_count()
                logger.info(f"サブスクリプション登録: {subscription.endpoint[:50]}... (合計: {count}件)")
                return True
        except PushNotificationError:
            raise
        except Exception as e:
            logger.error(f"サブスクリプション登録エラー: {e}")
            raise PushNotificationError(f"サブスクリプション登録に失敗しました: {e}")

    async def update_preferences(self, endpoint: str, **kwargs) -> bool:
        """
        サブスクリプションの通知設定を更新

        Args:
            endpoint: 対象エンドポイントURL
            **kwargs: 更新するフィールド（language, preferred_regions, earthquake_threshold,
                      tsunami_alerts, weather_alerts）

        Returns:
            bool: 更新成功時True、対象が見つからない場合False
        """
        try:
            async with async_session() as session:
                stmt = select(PushSubscriptionRow).where(
                    PushSubscriptionRow.endpoint == endpoint
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    logger.warning(f"設定更新対象のサブスクリプション未検出: {endpoint[:50]}...")
                    return False

                # 指定されたフィールドのみ更新
                if "language" in kwargs and kwargs["language"] is not None:
                    existing.language = kwargs["language"]
                if "preferred_regions" in kwargs and kwargs["preferred_regions"] is not None:
                    existing.preferred_regions = json.dumps(kwargs["preferred_regions"])
                if "earthquake_threshold" in kwargs and kwargs["earthquake_threshold"] is not None:
                    existing.earthquake_threshold = kwargs["earthquake_threshold"]
                if "tsunami_alerts" in kwargs and kwargs["tsunami_alerts"] is not None:
                    existing.tsunami_alerts = kwargs["tsunami_alerts"]
                if "weather_alerts" in kwargs and kwargs["weather_alerts"] is not None:
                    existing.weather_alerts = kwargs["weather_alerts"]

                existing.updated_at = datetime.now(timezone.utc)
                await session.commit()
                logger.info(f"通知設定更新: {endpoint[:50]}...")
                return True
        except Exception as e:
            logger.error(f"通知設定更新エラー: {e}")
            raise PushNotificationError(f"通知設定の更新に失敗しました: {e}")

    async def get_preferences(self, endpoint: str) -> Optional[dict]:
        """
        サブスクリプションの通知設定を取得

        Args:
            endpoint: 対象エンドポイントURL

        Returns:
            dict: 設定情報（見つからない場合はNone）
        """
        try:
            async with async_session() as session:
                stmt = select(PushSubscriptionRow).where(
                    PushSubscriptionRow.endpoint == endpoint
                )
                result = await session.execute(stmt)
                row = result.scalar_one_or_none()

                if not row:
                    return None

                # preferred_regions をJSONからリストに変換
                regions: list[str] = []
                if row.preferred_regions:
                    try:
                        regions = json.loads(row.preferred_regions)
                    except (json.JSONDecodeError, TypeError):
                        regions = []

                return {
                    "endpoint": row.endpoint,
                    "language": row.language,
                    "preferred_regions": regions,
                    "earthquake_threshold": row.earthquake_threshold,
                    "tsunami_alerts": row.tsunami_alerts,
                    "weather_alerts": row.weather_alerts,
                }
        except Exception as e:
            logger.error(f"通知設定取得エラー: {e}")
            return None

    def _regions_match(self, user_regions_json: Optional[str], affected_areas: list[str]) -> bool:
        """ユーザーの監視地域と影響地域が一致するかチェック

        Args:
            user_regions_json: ユーザーの監視地域（JSON文字列）
            affected_areas: 影響を受ける地域コードリスト

        Returns:
            bool: 一致する場合True（地域未設定は全国監視とみなす）
        """
        if not user_regions_json:
            return True  # 地域未設定 = 全国監視
        try:
            user_regions = json.loads(user_regions_json)
            return bool(set(user_regions) & set(affected_areas))
        except (json.JSONDecodeError, TypeError):
            return True  # パースエラー = 全国監視とみなす

    async def unsubscribe(self, endpoint: str) -> bool:
        """
        サブスクリプションを解除

        Args:
            endpoint: 解除するエンドポイントURL

        Returns:
            bool: 解除成功時True（存在しない場合はFalse）
        """
        try:
            async with async_session() as session:
                stmt = delete(PushSubscriptionRow).where(
                    PushSubscriptionRow.endpoint == endpoint
                )
                result = await session.execute(stmt)
                await session.commit()

                if result.rowcount > 0:
                    logger.info(f"サブスクリプション解除: {endpoint[:50]}...")
                    return True

                logger.warning(f"サブスクリプション未検出: {endpoint[:50]}...")
                return False
        except Exception as e:
            logger.error(f"サブスクリプション解除エラー: {e}")
            raise PushNotificationError(f"サブスクリプション解除に失敗しました: {e}")

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
            # DBから全サブスクリプションを取得
            try:
                async with async_session() as session:
                    stmt = select(PushSubscriptionRow)
                    result = await session.execute(stmt)
                    rows = result.scalars().all()
                    targets = [
                        {
                            "endpoint": row.endpoint,
                            "keys": {"p256dh": row.key_p256dh, "auth": row.key_auth},
                        }
                        for row in rows
                    ]
            except Exception as e:
                logger.error(f"サブスクリプション取得エラー: {e}")
                return 0

        if not targets:
            logger.warning("送信先のサブスクリプションがありません")
            return 0

        _sem = asyncio.Semaphore(self.MAX_CONCURRENT_PUSH)

        async def _send_one(sub_info: dict) -> tuple[bool, Optional[str]]:
            async with _sem:
                try:
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
                    return (True, None)
                except WebPushException as e:
                    status_code = getattr(e, "response", None)
                    if status_code and hasattr(status_code, "status_code"):
                        sc = status_code.status_code
                        if sc in (404, 410):
                            logger.info(f"無効なサブスクリプション削除: {sub_info['endpoint'][:50]}...")
                            return (False, sub_info["endpoint"])
                    logger.error(f"プッシュ送信エラー: {e}")
                    return (False, None)
                except Exception as e:
                    logger.error(f"予期せぬプッシュ送信エラー: {e}")
                    return (False, None)

        results = await asyncio.gather(*[_send_one(sub) for sub in targets])

        sent_count = sum(1 for success, _ in results if success)
        failed_endpoints: list[str] = [
            ep for success, ep in results if not success and ep is not None
        ]

        # 無効なサブスクリプションをDBから削除
        if failed_endpoints:
            try:
                async with async_session() as session:
                    stmt = delete(PushSubscriptionRow).where(
                        PushSubscriptionRow.endpoint.in_(failed_endpoints)
                    )
                    await session.execute(stmt)
                    await session.commit()
                logger.info(f"無効なサブスクリプション{len(failed_endpoints)}件を削除")
            except Exception as e:
                logger.error(f"無効サブスクリプション削除エラー: {e}")

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

        safe_alert_type = alert_type if alert_type in VALID_ALERT_TYPES else "unknown"
        return await self.send_notification(
            title=title,
            body=message,
            url=f"/?alert={safe_alert_type}",
        )

    async def send_regional_alert(
        self,
        alert_type: str,
        message: str,
        severity: str,
        affected_areas: list[str],
        lang: str = "ja",
    ) -> int:
        """
        地域セグメント通知を送信

        affected_areas に一致する地域を監視しているユーザーにのみ通知。
        preferred_regions が空のユーザーは全国監視とみなし、常に通知。

        Args:
            alert_type: 災害種別（earthquake, tsunami, weather等）
            message: 通知メッセージ
            severity: 重要度（low, medium, high, extreme）
            affected_areas: 影響を受ける地域コードリスト（例: ["130000"]）
            lang: 言語コード

        Returns:
            int: 送信成功数
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
                "weather": "気象警報",
            },
            "en": {
                "earthquake": "Earthquake Alert",
                "tsunami": "Tsunami Warning",
                "flood": "Flood Warning",
                "typhoon": "Typhoon Alert",
                "volcano": "Volcanic Alert",
                "landslide": "Landslide Warning",
                "fire": "Fire Alert",
                "weather": "Weather Warning",
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

        safe_alert_type = alert_type if alert_type in VALID_ALERT_TYPES else "unknown"
        payload = json.dumps({
            "title": title,
            "body": message,
            "url": f"/?alert={safe_alert_type}",
            "tag": "disaster-alert",
            "icon": "/icons/icon-192x192.png",
            "badge": "/icons/badge-72x72.png",
        }, ensure_ascii=False)

        vapid_claims = {
            "sub": f"mailto:{self._vapid_claims_email}",
        }

        # DBから全サブスクリプションを取得しフィルタリング
        targets: list[dict] = []
        try:
            async with async_session() as session:
                stmt = select(PushSubscriptionRow)
                result = await session.execute(stmt)
                rows = result.scalars().all()

                for row in rows:
                    # 地域フィルタ: 監視地域が一致するかチェック
                    if not self._regions_match(row.preferred_regions, affected_areas):
                        continue

                    # アラート種別フィルタ
                    if alert_type == "tsunami" and not row.tsunami_alerts:
                        continue
                    if alert_type in ("weather", "flood", "typhoon", "landslide") and not row.weather_alerts:
                        continue

                    # 地震の場合: 震度閾値チェック（severityから推定）
                    if alert_type == "earthquake":
                        severity_to_intensity = {
                            "low": 1,
                            "medium": 3,
                            "high": 5,
                            "extreme": 6,
                        }
                        estimated_intensity = severity_to_intensity.get(severity, 3)
                        if estimated_intensity < row.earthquake_threshold:
                            continue

                    targets.append({
                        "endpoint": row.endpoint,
                        "keys": {"p256dh": row.key_p256dh, "auth": row.key_auth},
                    })
        except Exception as e:
            logger.error(f"地域セグメント通知: サブスクリプション取得エラー: {e}")
            return 0

        if not targets:
            logger.info(f"地域セグメント通知: 対象サブスクリプションなし (地域: {affected_areas})")
            return 0

        _sem = asyncio.Semaphore(self.MAX_CONCURRENT_PUSH)

        async def _send_one(sub_info: dict) -> tuple[bool, Optional[str]]:
            async with _sem:
                try:
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
                    return (True, None)
                except WebPushException as e:
                    status_code = getattr(e, "response", None)
                    if status_code and hasattr(status_code, "status_code"):
                        sc = status_code.status_code
                        if sc in (404, 410):
                            logger.info(f"無効なサブスクリプション削除: {sub_info['endpoint'][:50]}...")
                            return (False, sub_info["endpoint"])
                    logger.error(f"プッシュ送信エラー: {e}")
                    return (False, None)
                except Exception as e:
                    logger.error(f"予期せぬプッシュ送信エラー: {e}")
                    return (False, None)

        results = await asyncio.gather(*[_send_one(sub) for sub in targets])

        sent_count = sum(1 for success, _ in results if success)
        failed_endpoints: list[str] = [
            ep for success, ep in results if not success and ep is not None
        ]

        # 無効なサブスクリプションをDBから削除
        if failed_endpoints:
            try:
                async with async_session() as session:
                    stmt = delete(PushSubscriptionRow).where(
                        PushSubscriptionRow.endpoint.in_(failed_endpoints)
                    )
                    await session.execute(stmt)
                    await session.commit()
                logger.info(f"無効なサブスクリプション{len(failed_endpoints)}件を削除")
            except Exception as e:
                logger.error(f"無効サブスクリプション削除エラー: {e}")

        logger.info(
            f"地域セグメント通知送信完了: {sent_count}/{len(targets)}件成功 "
            f"(対象地域: {affected_areas})"
        )
        return sent_count

    async def get_subscription_count(self) -> int:
        """登録中のサブスクリプション数を取得"""
        try:
            async with async_session() as session:
                stmt = select(func.count()).select_from(PushSubscriptionRow)
                result = await session.execute(stmt)
                return result.scalar_one()
        except Exception as e:
            logger.error(f"サブスクリプション数取得エラー: {e}")
            return 0
