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

// Wave 2 IDOR 根本修正: subscribe 時に発行される management_token を
// localStorage に保管。unsubscribe/preferences 操作時に body に必須で含める。
// 1ブラウザ=1subscription 前提のため単一キーで管理する。
const MANAGEMENT_TOKEN_KEY = 'push_management_token';

function getStoredManagementToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(MANAGEMENT_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredManagementToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(MANAGEMENT_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(MANAGEMENT_TOKEN_KEY);
    }
  } catch {
    // localStorage 不可 (private mode等) は無視
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
