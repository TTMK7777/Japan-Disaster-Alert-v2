// Japan Disaster Alert - Service Worker
// Version: 1.0.0
// オフライン対応とキャッシュ戦略

const CACHE_NAME = 'disaster-alert-v1';
const OFFLINE_URL = '/offline.html';

// キャッシュするアセット
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
];

// キャッシュ戦略の設定
const CACHE_STRATEGIES = {
  // 静的アセット: キャッシュファースト
  static: [
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/,
    /^\/_next\/static\//,
  ],
  // API: ネットワークファースト、フォールバックあり
  api: [
    /^\/api\//,
    /earthquakes/,
    /weather/,
  ],
  // 地図タイル: キャッシュファースト with 長期キャッシュ
  mapTiles: [
    /cyberjapandata\.gsi\.go\.jp/,
    /tile\.openstreetmap\.org/,
  ],
};

// Service Worker インストール
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // 即座にアクティベート
  self.skipWaiting();
});

// Service Worker アクティベーション
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // 即座にコントロールを取得
  self.clients.claim();
});

// フェッチイベント処理
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // POSTリクエストはスキップ
  if (request.method !== 'GET') return;

  // キャッシュ戦略の判定
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else if (isApiRequest(url)) {
    event.respondWith(networkFirst(request));
  } else if (isMapTile(url)) {
    event.respondWith(cacheFirstWithExpiry(request, 7 * 24 * 60 * 60 * 1000)); // 7日
  } else {
    event.respondWith(networkFirst(request));
  }
});

// 静的アセット判定
function isStaticAsset(url) {
  return CACHE_STRATEGIES.static.some((pattern) => pattern.test(url.pathname) || pattern.test(url.href));
}

// API判定
function isApiRequest(url) {
  return CACHE_STRATEGIES.api.some((pattern) => pattern.test(url.pathname) || pattern.test(url.href));
}

// 地図タイル判定
function isMapTile(url) {
  return CACHE_STRATEGIES.mapTiles.some((pattern) => pattern.test(url.href));
}

// キャッシュファースト戦略
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Cache first failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// ネットワークファースト戦略
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network first, falling back to cache:', request.url);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // オフラインページを表示（HTML リクエストの場合）
    if (request.headers.get('Accept')?.includes('text/html')) {
      return caches.match(OFFLINE_URL);
    }

    return new Response(JSON.stringify({
      error: 'Offline',
      message_ja: 'オフラインです。インターネット接続を確認してください。',
      message_en: 'You are offline. Please check your internet connection.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// キャッシュファースト with 有効期限
async function cacheFirstWithExpiry(request, maxAge) {
  const cached = await caches.match(request);

  if (cached) {
    const dateHeader = cached.headers.get('date');
    if (dateHeader) {
      const cachedDate = new Date(dateHeader).getTime();
      if (Date.now() - cachedDate < maxAge) {
        return cached;
      }
    } else {
      return cached; // 日付がない場合はキャッシュを使用
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cached) {
      return cached; // エラー時は期限切れでもキャッシュを返す
    }
    throw error;
  }
}

// プッシュ通知の受信
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let data = {
    title: '災害情報',
    body: '新しい災害情報があります',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'disaster-alert',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      vibrate: [200, 100, 200], // 緊急通知用のバイブレーション
      requireInteraction: true, // 手動で閉じるまで表示
      actions: [
        { action: 'view', title: '確認する' },
        { action: 'dismiss', title: '閉じる' },
      ],
    })
  );
});

// 通知クリック処理
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // 既存のウィンドウがあればフォーカス
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しいウィンドウを開く
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-earthquake-data') {
    event.waitUntil(syncEarthquakeData());
  }
});

async function syncEarthquakeData() {
  try {
    const response = await fetch('/api/v1/earthquakes?limit=10');
    if (response.ok) {
      const data = await response.json();
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/api/v1/earthquakes?limit=10', new Response(JSON.stringify(data)));
      console.log('[SW] Earthquake data synced');
    }
  } catch (error) {
    console.log('[SW] Sync failed:', error);
  }
}
