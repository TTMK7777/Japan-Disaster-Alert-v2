// Japan Disaster Alert - Service Worker
// Version: 1.0.0
// オフライン対応とキャッシュ戦略

// offline.html / offline.js を変えたら上げる。install は sw.js のバイト差分でしか走らないため、
// 上げないと既存の利用者は古いオフライン画面（cache.addAll 済みのもの）を見続ける。
// v3: オフライン画面に「このアプリが扱う範囲（避難指示・避難所は扱わない）」を追加
// v6: API のキャッシュに保存時刻（X-SW-Cached-At）を付けた。保存時刻の無い旧キャッシュを捨てる
// v7: オフライン画面の緊急連絡に 171・#7119・医療機関検索・駐日公館・web171 と説明を追加（B11）。医療機関検索の URL は表示言語別
// v8: install 時に / が読み込む JS / CSS もキャッシュする（会話タブを電波なしで開くため。B10b）
const CACHE_NAME = 'disaster-alert-v8';

// 通信失敗時に API のキャッシュを返すときの印（frontend/src/lib/fetchFailure.ts と同じ名前）。
// 印が無いと、画面はキャッシュの古い JSON を「今取れた」と受け取り、
// 「最後に取得できた時刻」を現在時刻に進めてしまう（古い警報・古い空配列が最新に見える）
const SW_CACHE_HEADER = 'X-SW-Cache';
const SW_CACHED_AT_HEADER = 'X-SW-Cached-At';

// 地図タイルはアプリ資産と別のキャッシュに置く。
// 同居させると、地図をパンするたびに際限なく増えたタイルが
// アプリ本体のキャッシュを圧迫し、ストレージ逼迫時の退避（オリジン単位で起きる）で
// オフライン行動ガイドごと巻き添えで消えうる。分けたうえで枚数に上限を設ける。
const TILE_CACHE_NAME = 'disaster-alert-tiles-v1';
const TILE_CACHE_MAX_ENTRIES = 300; // 256px タイル約300枚 ≒ 15MB 程度を上限の目安とする

// activate 時に消さずに残すキャッシュ。
// **ここに TILE_CACHE_NAME を入れ忘れると、分離した瞬間に毎回消えて機能しなくなる。**
const KEEP_CACHES = [CACHE_NAME, TILE_CACHE_NAME];

const OFFLINE_URL = '/offline.html';

// キャッシュするアセット
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/offline.js',
  // 「現在地から選ぶ」の県推定の表（src/lib/prefGrid.ts）。圏外でも推定できるように先に入れる
  '/data/pref-grid.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
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

// install 時に、この HTML が読み込む Next.js の資源（/_next/static の JS / CSS）もキャッシュするページ。
// 資源の名前はビルドごとにハッシュが変わるので sw.js には書けない。キャッシュした HTML から拾う。
// 以前は初回訪問の資源（SW が制御を取る前に読み込んだもの）が一つもキャッシュされず、
// 電波を切って開き直すと HTML だけが出てタブが動かなかった（会話カードの文も JS の中にある）
const PRECACHE_PAGES = ['/'];

// HTML の script / link と、RSC の flight データ（"static/chunks/..."）の両方を拾う。
// 直前が引用符のものだけ（https://別オリジン/_next/... は拾わない）
const NEXT_STATIC_ASSET_PATTERN = /["'](?:\/_next\/)?(static\/(?:chunks|css|media)\/[^"'\s\\?#]+?\.(?:js|css|woff2?))/g;

/** HTML の本文から /_next/static の資源のパスを重複なしで取り出す */
function extractNextStaticAssets(html) {
  const found = new Set();
  for (const match of html.matchAll(NEXT_STATIC_ASSET_PATTERN)) {
    // polyfills は noModule（古いブラウザ専用）。SW が動くブラウザは読まないので入れない
    if (/\/polyfills-/.test(match[1])) continue;
    found.add('/_next/' + match[1]);
  }
  return [...found];
}

/**
 * PRECACHE_PAGES の HTML が読み込む資源をキャッシュする。
 * **1 件ずつ・失敗は無視する。** addAll にすると 1 件の 404 で install ごと失敗し、
 * オフライン画面（offline.html）まで入らなくなる
 */
async function precachePageAssets(cache) {
  for (const page of PRECACHE_PAGES) {
    const response = await cache.match(page);
    if (!response) continue;
    const assets = extractNextStaticAssets(await response.clone().text());
    await Promise.all(
      assets.map((asset) =>
        cache.add(asset).catch((error) => console.log('[SW] Precache skipped:', asset, error))
      )
    );
  }
}

// Service Worker インストール
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Caching static assets');
      await cache.addAll(STATIC_ASSETS);
      await precachePageAssets(cache);
    })
  );
  // 即座にアクティベート
  self.skipWaiting();
});

// Service Worker アクティベーション
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    (async () => {
      // Navigation Preload を有効化（対応ブラウザのみ）
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !KEEP_CACHES.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })()
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
  //
  // **地図タイルを最初に判定する。** 地図タイルの URL は `.png` で終わるため、
  // 先に isStaticAsset を通すとそこで捕まってしまい、地図タイル用の
  // cacheFirstWithExpiry には**一度も到達しない**（＝7日キャッシュは
  // 書かれているだけで動いていなかった）。順序がそのまま挙動を決める。
  if (isMapTile(url)) {
    event.respondWith(cacheFirstWithExpiry(request, 7 * 24 * 60 * 60 * 1000)); // 7日
  } else if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, { api: true }));
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

// ネットワークファースト戦略。
// api: true のときは、保存時に保存時刻を付け、通信失敗でキャッシュを返すときに印を付ける
async function networkFirst(request, { api = false } = {}) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, api ? withCachedAt(response.clone()) : response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network first, falling back to cache:', request.url);
    const cached = await caches.match(request);
    if (cached) {
      return api ? markFromCache(cached) : cached;
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

/** 保存する応答に保存時刻を付ける（ヘッダ以外は同じ） */
function withCachedAt(response) {
  const headers = new Headers(response.headers);
  headers.set(SW_CACHED_AT_HEADER, new Date().toISOString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * キャッシュから返す応答に X-SW-Cache: 1 を付ける。
 *
 * SW が作った応答は、別オリジンの API への fetch でも CORS の公開ヘッダ
 * （Access-Control-Expose-Headers）に載せた名前しか画面から読めない。
 * 印・保存時刻と、元の応答で読めていたヘッダ（X-Failed-Areas 等）をすべて公開する
 */
function markFromCache(cached) {
  const headers = new Headers(cached.headers);
  headers.set(SW_CACHE_HEADER, '1');
  const exposed = [];
  const seen = new Set();
  const add = (name) => {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) return;
    seen.add(trimmed.toLowerCase());
    exposed.push(trimmed);
  };
  [SW_CACHE_HEADER, SW_CACHED_AT_HEADER].forEach(add);
  (headers.get('Access-Control-Expose-Headers') || '').split(',').forEach(add);
  for (const name of headers.keys()) add(name);
  headers.set('Access-Control-Expose-Headers', exposed.join(', '));
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
}

// キャッシュファースト with 有効期限
async function cacheFirstWithExpiry(request, maxAge) {
  const cache = await caches.open(TILE_CACHE_NAME);
  const cached = await cache.match(request);

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
    // **response.ok が真になるのは、タイルを CORS で取得している場合だけ。**
    // <img> の既定（crossorigin 無し）だと no-cors 扱いになり、返るのは status 0 の
    // opaque レスポンスで ok は常に false ＝ 一枚もキャッシュされない。
    // 実測でもタイル 6/6 が表示されているのにキャッシュ 0 件だった。
    // TileLayer 側に crossOrigin を付けて CORS で取ることでここが成立する
    // （地理院タイルが CORS を返すことは実測で確認済み）。
    if (response.ok) {
      await cache.put(request, response.clone());
      await trimCache(cache, TILE_CACHE_MAX_ENTRIES);
    }
    return response;
  } catch (error) {
    if (cached) {
      return cached; // 圏外・停電時は期限切れでもキャッシュを返す（これがオフライン地図の本体）
    }
    throw error;
  }
}

/**
 * キャッシュの件数に上限を設け、古いものから捨てる。
 * Cache Storage の keys() は挿入順を保つため、先頭が最も古い。
 * 上限が無いと地図をパンした分だけ無限に増える。
 */
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
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
      // 注意: client.url は絶対URL（https://host/...）なのでパス名で比較する
      for (const client of clientList) {
        if (new URL(client.url).pathname === '/' && 'focus' in client) {
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
      await cache.put(
        '/api/v1/earthquakes?limit=10',
        new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', [SW_CACHED_AT_HEADER]: new Date().toISOString() },
        })
      );
      console.log('[SW] Earthquake data synced');
    }
  } catch (error) {
    console.log('[SW] Sync failed:', error);
  }
}
