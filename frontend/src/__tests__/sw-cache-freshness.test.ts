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

function createCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (req: Request | string, res: Response) => {
        store.set(typeof req === 'string' ? req : req.url, res);
      },
      match: async (req: Request | string) => {
        const hit = store.get(typeof req === 'string' ? req : req.url);
        return hit ? hit.clone() : undefined;
      },
      addAll: async () => {},
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

function loadSw(network: () => Promise<Response>) {
  const handlers = new Map<string, Handler>();
  const self = {
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: () => {},
    registration: {},
    clients: { claim: () => {} },
  };
  const caches = createCaches();
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
  return { dispatchFetch, caches };
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
