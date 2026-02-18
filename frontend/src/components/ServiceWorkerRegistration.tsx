'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Service Worker の登録
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[App] Service Worker registered:', registration.scope);

          // 更新があった場合の処理
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    // 新しいバージョンが利用可能
                    console.log('[App] New Service Worker available');
                    // オプション: ユーザーに更新を促す
                    if (window.confirm('新しいバージョンが利用可能です。更新しますか？')) {
                      window.location.reload();
                    }
                  } else {
                    // 初回インストール完了
                    console.log('[App] Service Worker installed for the first time');
                  }
                }
              };
            }
          };
        })
        .catch((error) => {
          console.error('[App] Service Worker registration failed:', error);
        });

      // オフライン/オンライン状態の監視
      window.addEventListener('online', () => {
        console.log('[App] Back online');
      });

      window.addEventListener('offline', () => {
        console.log('[App] Gone offline');
      });
    }
  }, []);

  return null;
}
