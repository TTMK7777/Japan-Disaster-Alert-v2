'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

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
                  // 新しいバージョンが利用可能。
                  // **確認ダイアログは出さない。** sw.js は skipWaiting() +
                  // clients.claim() で即時に制御を取る設計（災害情報アプリは
                  // 常に最新のロジックで動くべき）なので、ダイアログが出る
                  // 時点で新 SW は既に fetch を握っており「更新しますか？」は
                  // 実効性のない選択だった。しかも文言が日本語固定で、
                  // 16 言語アプリの非日本語話者には読めない全画面ブロックだった。
                  // ページ資産は次の再読み込みで自然に新しくなる
                  console.log('[App] New Service Worker activated');
                } else {
                  // 初回インストール完了
                  console.log('[App] Service Worker installed for the first time');
                }
              }
              if (installingWorker.state === 'activated') {
                console.log('[SW] New version available, please refresh.');
              }
            };
          }
        };
      })
      .catch((error) => {
        console.error('[App] Service Worker registration failed:', error);
      });

    // オフライン/オンライン状態の監視（クリーンアップでリスナーを解除）
    const handleOnline = () => {
      console.log('[App] Back online');
    };
    const handleOffline = () => {
      console.log('[App] Gone offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return null;
}
