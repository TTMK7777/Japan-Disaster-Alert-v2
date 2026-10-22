// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Service Worker が API の通信失敗時にキャッシュを返すとき、それと分かる印を付ける（B4b）。
 *
 * 以前はキャッシュの JSON をそのまま返していたため、画面は「今取れた」と受け取り
 * 「最後に取得できた時刻」を現在時刻に進めていた（古い警報・古い空配列が最新に見える）。
 * キャッシュから返す応答には `X-SW-Cache: 1` と保存時刻 `X-SW-Cached-At` を付ける。
 *
 * sw.js を実際に評価し、fetch イベントを発火して応答を見る（文字列の有無ではなく振る舞いで固定）。
 */

const SW_SOURCE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf-8');
const API_URL = 'http://localhost:8000/api/v1/earthquakes?lang=ja&limit=20';

type Handler = (event: unknown) => void;

function createCaches(network: (req: Request | string) => Promise<Response> = async () => new Response('')) {
  const stores = new Map<string, Map<string, Response>>();
  // 相対 URL（'/' 等）は SW のオリジンで絶対 URL にそろえる（本物の Cache Storage と同じ）
  const keyOf = (req: Request | string) => new URL(typeof req === 'string' ? req : req.url, 'http://localhost:3000').href;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (req: Request | string, res: Response) => {
        store.set(keyOf(req), res);
      },
      match: async (req: Request | string) => {
        const hit = store.get(keyOf(req));
        return hit ? hit.clone() : undefined;
      },
      // 本物と同じく 1 件でも失敗（通信失敗・!ok）したら全体が reject する
      add: async (req: Request | string) => {
        const res = await network(req);
        if (!res.ok) throw new TypeError(`add failed: ${keyOf(req)} ${res.status}`);
        store.set(keyOf(req), res);
      },
      addAll: async (reqs: (Request | string)[]) => {
        const results = await Promise.all(
          reqs.map(async (req) => {
            const res = await network(req);
            if (!res.ok) throw new TypeError(`addAll failed: ${keyOf(req)} ${res.status}`);
            return [keyOf(req), res] as const;
          })
        );
        for (const [k, res] of results) store.set(k, res);
      },
      keys: async () => [],
      delete: async () => true,
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (req: Request | string) => {
      for (const name of stores.keys()) {
        const hit = await (await open(name)).match(req);
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

function loadSw(network: (req: Request | string) => Promise<Response>) {
  const handlers = new Map<string, Handler>();
  const self = {
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: () => {},
    registration: {},
    clients: { claim: () => {} },
  };
  const caches = createCaches(network);
  const quiet = { log: () => {}, warn: () => {}, error: () => {} };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'fetch', 'clients', 'console', SW_SOURCE)(
    self,
    caches,
    network,
    self.clients,
    quiet
  );
  const dispatchFetch = async (url: string): Promise<Response> => {
    let responded: Promise<Response> | null = null;
    handlers.get('fetch')!({
      request: new Request(url),
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
      waitUntil: () => {},
    });
    const res = await responded!;
    // 成功時のキャッシュ書き込みは応答を返した後に走るので流す
    await new Promise((r) => setTimeout(r, 0));
    return res;
  };
  /** install を発火し、waitUntil に渡された処理の完了（または失敗）を返す */
  const dispatchInstall = async (): Promise<void> => {
    let waited: Promise<unknown> | null = null;
    handlers.get('install')!({
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    });
    await waited;
  };
  return { dispatchFetch, dispatchInstall, caches };
}

let online = true;
const body = JSON.stringify([{ id: 'eq1' }]);
const network = async () => {
  if (!online) throw new TypeError('Failed to fetch');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Expose-Headers': 'X-Failed-Areas, X-Failed-Area-Names',
    },
  });
};

beforeEach(() => {
  online = true;
});

describe('sw.js — API のキャッシュ応答に印を付ける', () => {
  it('通信できたときの応答には印を付けない', async () => {
    const { dispatchFetch } = loadSw(network);
    const res = await dispatchFetch(API_URL);
    expect(res.headers.get('X-SW-Cache')).toBeNull();
    expect(await res.text()).toBe(body);
  });

  it('通信できないときのキャッシュ応答は X-SW-Cache: 1 と保存時刻を持ち、本文は同じ', async () => {
    const { dispatchFetch } = loadSw(network);
    const before = Date.now();
    await dispatchFetch(API_URL);
    const after = Date.now();

    online = false;
    const res = await dispatchFetch(API_URL);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-SW-Cache')).toBe('1');
    const cachedAt = Date.parse(res.headers.get('X-SW-Cached-At') ?? '');
    expect(cachedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(cachedAt).toBeLessThanOrEqual(after + 1000);
    expect(await res.text()).toBe(body);
  });

  it('別オリジンの API でも画面から読めるよう、印のヘッダを公開する（既存の公開ヘッダは残す）', async () => {
    const { dispatchFetch } = loadSw(network);
    await dispatchFetch(API_URL);
    online = false;
    const res = await dispatchFetch(API_URL);
    const exposed = (res.headers.get('Access-Control-Expose-Headers') ?? '')
      .split(',')
      .map((s) => s.trim());
    expect(exposed).toEqual(
      expect.arrayContaining(['X-SW-Cache', 'X-SW-Cached-At', 'X-Failed-Areas', 'X-Failed-Area-Names'])
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
  });

  it('キャッシュ名を上げてある（旧キャッシュの保存時刻なし応答を activate で捨てる）', () => {
    const match = SW_SOURCE.match(/const CACHE_NAME = 'disaster-alert-v(\d+)'/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(6);
  });
});

describe('sw.js — 会話タブをオフラインで開くためのプリキャッシュ（B10b）', () => {
  const ORIGIN = 'http://localhost:3000';
  // 本番の / の HTML の形（script タグと、RSC の flight データ内の "static/chunks/..." の両方）
  const HOME_HTML = [
    '<!DOCTYPE html><html><head>',
    '<link rel="stylesheet" href="/_next/static/css/app-layout.css" data-precedence="next"/>',
    '<script src="/_next/static/chunks/webpack-abc.js" async=""></script>',
    '<script src="/_next/static/chunks/app/page-def.js" async=""></script>',
    '<script src="https://cdn.example.com/_next/static/chunks/evil.js"></script>',
    '<script src="/_next/static/chunks/polyfills-42372ed130431b0a.js" noModule=""></script>',
    '</head><body>',
    '<script>self.__next_f.push([1,"2:I[\\"123\\",[\\"static/chunks/123-ghi.js\\",\\"static/chunks/app/page-def.js\\"],\\"default\\"]"])</script>',
    '</body></html>',
  ].join('');

  function siteNetwork(fail: Set<string> = new Set()) {
    const requested: string[] = [];
    const net = async (req: Request | string) => {
      const raw = typeof req === 'string' ? req : req.url;
      const url = new URL(raw, ORIGIN);
      requested.push(url.href);
      if (url.origin !== ORIGIN) throw new TypeError('cross-origin fetch in test');
      if (fail.has(url.pathname)) return new Response('nf', { status: 404 });
      if (url.pathname === '/') return new Response(HOME_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
      return new Response(`/* ${url.pathname} */`, { status: 200 });
    };
    return { net, requested };
  }

  const cachedPaths = (caches: ReturnType<typeof createCaches>, name: string) =>
    [...(caches.stores.get(name)?.keys() ?? [])].map((k) => new URL(k, ORIGIN).pathname);

  it('install で / が読み込む JS / CSS（会話カードの文とタブの部品を含む）をキャッシュする', async () => {
    const { net } = siteNetwork();
    const { dispatchInstall, caches } = loadSw(net);
    await dispatchInstall();
    const name = SW_SOURCE.match(/const CACHE_NAME = '([^']+)'/)![1];
    const paths = cachedPaths(caches, name);
    expect(paths).toEqual(expect.arrayContaining(['/', '/offline.html', '/manifest.json']));
    expect(paths).toEqual(
      expect.arrayContaining([
        '/_next/static/css/app-layout.css',
        '/_next/static/chunks/webpack-abc.js',
        '/_next/static/chunks/app/page-def.js',
        '/_next/static/chunks/123-ghi.js',
      ])
    );
    // 別オリジンの URL は拾わない（同じパスを自オリジンに付け替えて取りにも行かない）
    expect(paths).not.toContain('/_next/static/chunks/evil.js');
    // 古いブラウザ専用（noModule）の polyfills は入れない
    expect(paths.some((p) => p.includes('polyfills'))).toBe(false);
  });

  it('資源の 1 件が 404 でも install は失敗しない（残りはキャッシュする）', async () => {
    const { net } = siteNetwork(new Set(['/_next/static/chunks/123-ghi.js']));
    const { dispatchInstall, caches } = loadSw(net);
    await expect(dispatchInstall()).resolves.toBeUndefined();
    const name = SW_SOURCE.match(/const CACHE_NAME = '([^']+)'/)![1];
    const paths = cachedPaths(caches, name);
    expect(paths).toContain('/_next/static/chunks/app/page-def.js');
    expect(paths).not.toContain('/_next/static/chunks/123-ghi.js');
  });

  it('キャッシュ名を v8 以上に上げてある（既存の利用者にも install を走らせる）', () => {
    const match = SW_SOURCE.match(/const CACHE_NAME = 'disaster-alert-v(\d+)'/);
    expect(Number(match![1])).toBeGreaterThanOrEqual(8);
  });

  it('オフラインで / を開くと、プリキャッシュ済みの HTML と JS がネットワーク無しで返る', async () => {
    let offline = false;
    const { net } = siteNetwork();
    const gated = async (req: Request | string) => {
      if (offline) throw new TypeError('Failed to fetch');
      return net(req);
    };
    const { dispatchInstall, dispatchFetch } = loadSw(gated);
    await dispatchInstall();
    offline = true;
    const html = await dispatchFetch(`${ORIGIN}/`);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('page-def.js');
    const js = await dispatchFetch(`${ORIGIN}/_next/static/chunks/app/page-def.js`);
    expect(js.status).toBe(200);
  });
});
