"""
Web Push通知サービス

VAPID認証によるWeb Push通知の送信・サブスクリプション管理を行う。
サブスクリプションはSQLAlchemy経由でDBに保存。
地域セグメント通知に対応。
"""
import asyncio
import json
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone
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


# ---------------------------------------------------------------------------
# Wave 2 IDOR 根本修正: management_token 不一致時のレート制限
#
# in-memory dict, プロセス再起動でリセット可。
# 同一 endpoint への不一致試行 5回/分 を超えると 1時間ロックアウト。
# 100 サブスクリプション規模想定なのでメモリ消費は無視できる。
# ---------------------------------------------------------------------------
_TOKEN_FAILURES: dict[str, list[datetime]] = defaultdict(list)
_TOKEN_FAILURE_WINDOW = timedelta(minutes=1)
_TOKEN_FAILURE_LIMIT = 5
_TOKEN_LOCKOUT_DURATION = timedelta(hours=1)
_TOKEN_LOCKOUTS: dict[str, datetime] = {}


def _is_token_locked(endpoint: str) -> bool:
    """endpoint がトークン不一致ロックアウト中か判定"""
    locked_until = _TOKEN_LOCKOUTS.get(endpoint)
    if locked_until and locked_until > datetime.now(timezone.utc):
        return True
    if locked_until:
        # 期限切れエントリは掃除
        _TOKEN_LOCKOUTS.pop(endpoint, None)
    return False


def _record_token_failure(endpoint: str) -> None:
    """トークン不一致を記録。閾値超過でロックアウト発動"""
    now = datetime.now(timezone.utc)
    failures = _TOKEN_FAILURES[endpoint]
    failures.append(now)
    cutoff = now - _TOKEN_FAILURE_WINDOW
    failures[:] = [t for t in failures if t > cutoff]
    if len(failures) >= _TOKEN_FAILURE_LIMIT:
        _TOKEN_LOCKOUTS[endpoint] = now + _TOKEN_LOCKOUT_DURATION
        failures.clear()
        logger.warning(
            f"トークン不一致ロックアウト発動: {endpoint[:50]}... (1時間)"
        )


def _reset_token_failures(endpoint: str) -> None:
    """成功時に失敗カウンタをリセット (テスト・正規操作の両方で使う)"""
    _TOKEN_FAILURES.pop(endpoint, None)


class TokenAuthError(Exception):
    """management_token 認証エラー

    .reason で "locked" / "legacy" / "mismatch" / "not_found" を区別する。
    main.py の例外ハンドラで適切な HTTP ステータスにマップする。
    """

    def __init__(self, reason: str, message: str = ""):
        super().__init__(message or reason)
        self.reason = reason


class PushNotificationService:
    """Web Push通知サービス"""

    MAX_CONCURRENT_PUSH = 10

    # 災害種別に応じた通知タイトル
    ALERT_TITLES = {
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

    # 重要度に応じたタイトルプレフィックス
    SEVERITY_PREFIXES = {
        "ja": {"extreme": "[緊急] ", "high": "[警報] ", "medium": "[注意] ", "low": ""},
        "en": {"extreme": "[EMERGENCY] ", "high": "[WARNING] ", "medium": "[ADVISORY] ", "low": ""},
    }

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
    ) -> tuple[bool, Optional[str]]:
        """
        サブスクリプションを登録

        Wave 2 IDOR 根本修正: 新規登録または legacy 行の補完時に
        management_token を発行し、(成否, token) を返却する。
        既に token を持つ行を更新する場合は、同じ token を再度返す。

        Args:
            subscription: Web Push サブスクリプション情報
            language: 言語コード（デフォルト: "ja"）
            preferred_regions: 監視対象地域コードリスト（Noneは全国監視）
            earthquake_threshold: 通知対象の最小震度（デフォルト: 3）
            tsunami_alerts: 津波警報を受信するか（デフォルト: True）
            weather_alerts: 気象警報を受信するか（デフォルト: True）

        Returns:
            tuple[bool, Optional[str]]: (登録成功フラグ, クライアントが保管すべき management_token)
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
                    # legacy row (token=null) なら新規発行、既存はそのまま
                    if existing.management_token is None:
                        existing.management_token = secrets.token_urlsafe(32)
                        logger.info(
                            f"legacy サブスクリプションに token 補完: {subscription.endpoint[:50]}..."
                        )
                    token = existing.management_token
                    await session.commit()
                    logger.info(f"サブスクリプション更新: {subscription.endpoint[:50]}...")
                    return True, token

                # 新規登録
                new_token = secrets.token_urlsafe(32)
                new_row = PushSubscriptionRow(
                    endpoint=subscription.endpoint,
                    key_p256dh=subscription.keys.get("p256dh", ""),
                    key_auth=subscription.keys.get("auth", ""),
                    language=language,
                    preferred_regions=regions_json,
                    earthquake_threshold=earthquake_threshold,
                    tsunami_alerts=tsunami_alerts,
                    weather_alerts=weather_alerts,
                    management_token=new_token,
                )
                session.add(new_row)
                try:
                    await session.commit()
                except IntegrityError:
                    # 競合INSERT発生 — 既存行の token を返す
                    await session.rollback()
                    stmt2 = select(PushSubscriptionRow).where(
                        PushSubscriptionRow.endpoint == subscription.endpoint
                    )
                    result2 = await session.execute(stmt2)
                    existing2 = result2.scalar_one_or_none()
                    existing_token: Optional[str] = None
                    if existing2 is not None:
                        if existing2.management_token is None:
                            existing2.management_token = secrets.token_urlsafe(32)
                            await session.commit()
                        existing_token = existing2.management_token
                    logger.info(f"サブスクリプション競合登録（既存）: {subscription.endpoint[:50]}...")
                    return True, existing_token
                count = await self.get_subscription_count()
                logger.info(f"サブスクリプション登録: {subscription.endpoint[:50]}... (合計: {count}件)")
                return True, new_token
        except PushNotificationError:
            raise
        except Exception as e:
            logger.error(f"サブスクリプション登録エラー: {e}")
            raise PushNotificationError(f"サブスクリプション登録に失敗しました: {e}")

    def _verify_token(self, row: Optional[PushSubscriptionRow], endpoint: str, token: str) -> None:
        """management_token の検証共通処理

        Wave 2 IDOR 根本修正の中核。timing attack 対策として
        secrets.compare_digest を使用する。

        Raises:
            TokenAuthError: 不一致・legacy・ロックアウト・行未検出 のいずれか
        """
        if _is_token_locked(endpoint):
            raise TokenAuthError(
                "locked",
                "Too many invalid token attempts. Try again later.",
            )
        if row is None:
            # 行が存在しない場合も timing 観点で同様に compare_digest を実行する
            # (ダミー文字列との比較で計算時間を揃える)
            secrets.compare_digest(token, "dummy_token_for_timing_constant")
            raise TokenAuthError("not_found", "Subscription not found")
        if row.management_token is None:
            # legacy row: 再 subscribe を促す
            logger.warning(
                f"legacy subscription rejected (token=null): {endpoint[:50]}..."
            )
            raise TokenAuthError(
                "legacy",
                "Please re-subscribe with the new client to obtain a management token.",
            )
        if not secrets.compare_digest(row.management_token, token):
            _record_token_failure(endpoint)
            logger.warning(f"management_token mismatch: {endpoint[:50]}...")
            raise TokenAuthError("mismatch", "Invalid token")
        # 成功時に過去の失敗カウンタをクリア
        _reset_token_failures(endpoint)

    async def update_preferences(self, endpoint: str, token: str, **kwargs) -> bool:
        """
        サブスクリプションの通知設定を更新

        Wave 2 IDOR 根本修正: management_token 必須化。
        token 不一致 / legacy / ロックアウト時は TokenAuthError を送出。

        Args:
            endpoint: 対象エンドポイントURL
            token: クライアント保持の management_token
            **kwargs: 更新するフィールド（language, preferred_regions, earthquake_threshold,
                      tsunami_alerts, weather_alerts）

        Returns:
            bool: 更新成功時True、対象が見つからない場合False

        Raises:
            TokenAuthError: 認証失敗 (locked / legacy / mismatch / not_found)
        """
        try:
            async with async_session() as session:
                stmt = select(PushSubscriptionRow).where(
                    PushSubscriptionRow.endpoint == endpoint
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                # token 検証 (失敗時は TokenAuthError)
                self._verify_token(existing, endpoint, token)
                assert existing is not None  # _verify_token が保証

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
        except TokenAuthError:
            raise
        except Exception as e:
            logger.error(f"通知設定更新エラー: {e}")
            raise PushNotificationError(f"通知設定の更新に失敗しました: {e}")

    async def get_preferences(self, endpoint: str, token: str) -> Optional[dict]:
        """
        サブスクリプションの通知設定を取得

        Wave 2 IDOR 根本修正: management_token 必須化。

        Args:
            endpoint: 対象エンドポイントURL
            token: クライアント保持の management_token

        Returns:
            dict: 設定情報（見つからない場合はNone）

        Raises:
            TokenAuthError: 認証失敗 (locked / legacy / mismatch / not_found)
        """
        try:
            async with async_session() as session:
                stmt = select(PushSubscriptionRow).where(
                    PushSubscriptionRow.endpoint == endpoint
                )
                result = await session.execute(stmt)
                row = result.scalar_one_or_none()

                # token 検証
                self._verify_token(row, endpoint, token)
                assert row is not None

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
        except TokenAuthError:
            raise
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

    async def unsubscribe(self, endpoint: str, token: str) -> bool:
        """
        サブスクリプションを解除

        Wave 2 IDOR 根本修正: management_token 必須化。
        正しい token を持つ場合のみ削除を実行する。

        Args:
            endpoint: 解除するエンドポイントURL
            token: クライアント保持の management_token

        Returns:
            bool: 解除成功時True

        Raises:
            TokenAuthError: 認証失敗 (locked / legacy / mismatch / not_found)
        """
        try:
            async with async_session() as session:
                stmt = select(PushSubscriptionRow).where(
                    PushSubscriptionRow.endpoint == endpoint
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                # token 検証 (not_found / mismatch / legacy / locked は例外)
                self._verify_token(existing, endpoint, token)
                assert existing is not None

                await session.delete(existing)
                await session.commit()
                # 成功時にロックアウト履歴を完全に掃除
                _TOKEN_LOCKOUTS.pop(endpoint, None)
                logger.info(f"サブスクリプション解除: {endpoint[:50]}...")
                return True
        except TokenAuthError:
            raise
        except Exception as e:
            logger.error(f"サブスクリプション解除エラー: {e}")
            raise PushNotificationError(f"サブスクリプション解除に失敗しました: {e}")

    def _require_enabled(self) -> None:
        """プッシュ通知が利用不可の場合に PushNotificationError を送出する"""
        if self.is_enabled:
            return
        if not PYWEBPUSH_AVAILABLE:
            raise PushNotificationError(
                "pywebpush がインストールされていません。"
                "'pip install pywebpush' を実行してください。"
            )
        raise PushNotificationError(
            "VAPID鍵が設定されていません。"
            "環境変数 VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIMS_EMAIL を設定してください。"
        )

    def _build_alert_title(self, alert_type: str, severity: str, lang: str) -> str:
        """災害種別と重要度から通知タイトルを生成する"""
        titles = self.ALERT_TITLES.get(lang, self.ALERT_TITLES["en"])
        title = titles.get(alert_type, "災害情報 / Disaster Alert")
        prefixes = self.SEVERITY_PREFIXES["ja"] if lang == "ja" else self.SEVERITY_PREFIXES["en"]
        return prefixes.get(severity, "") + title

    @staticmethod
    def _build_payload(title: str, body: str, url: str) -> str:
        """Web Push 通知ペイロード（JSON文字列）を生成する"""
        return json.dumps({
            "title": title,
            "body": body,
            "url": url,
            "tag": "disaster-alert",
            "icon": "/icons/icon-192x192.png",
            "badge": "/icons/badge-72x72.png",
        }, ensure_ascii=False)

    async def _dispatch_push(self, targets: list[dict], payload: str) -> int:
        """ペイロードを全送信先に並列送信し、無効サブスクリプションをDBから削除する

        Args:
            targets: {"endpoint": ..., "keys": {...}} のリスト
            payload: 送信するJSONペイロード

        Returns:
            int: 送信成功数
        """
        vapid_claims = {
            "sub": f"mailto:{self._vapid_claims_email}",
        }
        _sem = asyncio.Semaphore(self.MAX_CONCURRENT_PUSH)

        async def _send_one(sub_info: dict) -> tuple[bool, Optional[str]]:
            async with _sem:
                try:
                    # webpush は同期APIのため to_thread でイベントループをブロックしない
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
                    response = getattr(e, "response", None)
                    if response is not None and getattr(response, "status_code", None) in (404, 410):
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

        return sent_count

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
        self._require_enabled()

        payload = self._build_payload(title, body, url)

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

        sent_count = await self._dispatch_push(targets, payload)
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
        title = self._build_alert_title(alert_type, severity, lang)
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
        self._require_enabled()

        title = self._build_alert_title(alert_type, severity, lang)
        safe_alert_type = alert_type if alert_type in VALID_ALERT_TYPES else "unknown"
        payload = self._build_payload(title, message, f"/?alert={safe_alert_type}")

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

        sent_count = await self._dispatch_push(targets, payload)
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
