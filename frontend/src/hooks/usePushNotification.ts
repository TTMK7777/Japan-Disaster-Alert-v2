'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/config/api';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

// HIGH-3 修正: management_token を localStorage から外す。
//
// 設計判断:
//   - HttpOnly Cookie への完全移行は CORS/credentials/SameSite 設定の全面改修が必要なため
//     別 PR で扱う (長期対応)。
//   - 即時対応として 2 層構成にする:
//       1) インメモリ (モジュールスコープ変数) を一次保管。JS から直接 export しない。
//       2) sessionStorage を二次保管 (ページリロード復元用、タブ閉じれば消える)。
//     localStorage を排除することで XSS で「過去のトークンを永続的に窃取」される
//     最悪パターンを防ぐ。タブ生存中の XSS では sessionStorage は依然読めるが、
//     CSP (HIGH-2) でインラインスクリプト/外部スクリプト注入の成立難度が上がっており、
//     セッションスコープ化と組み合わせて攻撃面を大幅に縮小する。
//   - localStorage に旧トークンがある場合は migrate して即削除する。
const MANAGEMENT_TOKEN_KEY = 'push_management_token';

let inMemoryToken: string | null = null;

function getStoredManagementToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (inMemoryToken) return inMemoryToken;
  try {
    const fromSession = window.sessionStorage.getItem(MANAGEMENT_TOKEN_KEY);
    if (fromSession) {
      inMemoryToken = fromSession;
      return fromSession;
    }
    // 旧バージョン互換: localStorage に残っていれば一度だけ吸い上げて削除する
    const legacy = window.localStorage.getItem(MANAGEMENT_TOKEN_KEY);
    if (legacy) {
      try {
        window.sessionStorage.setItem(MANAGEMENT_TOKEN_KEY, legacy);
      } catch {
        // sessionStorage 不可でもインメモリには載せる
      }
      try {
        window.localStorage.removeItem(MANAGEMENT_TOKEN_KEY);
      } catch {
        // 削除失敗は致命でない
      }
      inMemoryToken = legacy;
      return legacy;
    }
    return null;
  } catch {
    return inMemoryToken;
  }
}

function setStoredManagementToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  inMemoryToken = token;
  try {
    if (token) {
      window.sessionStorage.setItem(MANAGEMENT_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(MANAGEMENT_TOKEN_KEY);
    }
    // localStorage には書かない。残骸がある場合は除去する。
    try {
      window.localStorage.removeItem(MANAGEMENT_TOKEN_KEY);
    } catch {
      // 無視
    }
  } catch {
    // sessionStorage 不可 (private mode等) でもインメモリには保持されている
  }
}

export function usePushNotification(language: string = 'ja') {
  const isSupported =
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'serviceWorker' in navigator;

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // 現在のパーミッションと購読状態を確認
  useEffect(() => {
    if (!isSupported) return;

    setPermission(Notification.permission);

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      } catch {
        setIsSubscribed(false);
      }
    })();
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) throw new Error('Push notifications are not supported');

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) throw new Error('VAPID public key is not configured');

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subJson = subscription.toJSON();
      const res = await fetch(`${API_BASE_URL}/api/v1/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh ?? '',
            auth: subJson.keys?.auth ?? '',
          },
          language,
        }),
      });

      // Wave 2: subscribe レスポンスから management_token を localStorage に保管
      if (res.ok) {
        try {
          const data = await res.json();
          if (data && typeof data.management_token === 'string') {
            setStoredManagementToken(data.management_token);
          }
        } catch {
          // JSON parse 失敗は致命でない (token が必要な操作で 403 となる)
        }
      }

      setIsSubscribed(true);
    } finally {
      setLoading(false);
    }
  }, [isSupported, language]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) return;

    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return;

      const endpoint = subscription.endpoint;
      const token = getStoredManagementToken();

      // Wave 2: token 未保持 = legacy 端末 → サーバー側登録は再 subscribe を要求
      // ブラウザ側 subscription だけ解除し、ローカル状態をリセット
      if (!token) {
        await subscription.unsubscribe();
        setStoredManagementToken(null);
        setIsSubscribed(false);
        // ユーザーには「再登録が必要」を伝えるべきだが本フックは UI 層を持たないため、
        // 呼び出し側で isSubscribed=false を検知して再 subscribe を促す UI を出す前提。
        return;
      }

      await subscription.unsubscribe();

      await fetch(`${API_BASE_URL}/api/v1/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, token }),
      });

      // 成功・失敗いずれの場合も localStorage は掃除する (ブラウザ側 subscription は既に解除済み)
      setStoredManagementToken(null);
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  /**
   * Wave 2 IDOR 根本修正: 通知設定の更新
   * subscribe 時に取得した management_token を body に必須で含める。
   * token 未保持時は再 subscribe が必要なので例外を投げる。
   */
  const updatePreferences = useCallback(
    async (updates: Record<string, unknown>): Promise<boolean> => {
      if (!isSupported) return false;
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return false;
      const token = getStoredManagementToken();
      if (!token) {
        throw new Error('管理トークンがありません。再度通知登録を行ってください。');
      }
      const res = await fetch(`${API_BASE_URL}/api/v1/push/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          token,
          ...updates,
        }),
      });
      return res.ok;
    },
    [isSupported],
  );

  /** Wave 2: 通知設定の問い合わせ */
  const queryPreferences = useCallback(async (): Promise<Record<string, unknown> | null> => {
    if (!isSupported) return null;
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return null;
    const token = getStoredManagementToken();
    if (!token) {
      throw new Error('管理トークンがありません。再度通知登録を行ってください。');
    }
    const res = await fetch(`${API_BASE_URL}/api/v1/push/preferences/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint, token }),
    });
    if (!res.ok) return null;
    return res.json();
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    updatePreferences,
    queryPreferences,
    // Wave 2: 管理トークン保持状況。false の場合は再 subscribe 案内 UI を出すべき
    hasManagementToken: getStoredManagementToken() !== null,
  };
}
