import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEventStream } from '../useEventStream';
import { SW_CACHE_HEADER, SW_CACHED_AT_HEADER } from '@/lib/fetchFailure';

/**
 * 「最後に取得できた時刻」を、上流から実際に取れたときだけ進める（B4b）。
 *
 * 1. SSE の heartbeat は接続が生きていることしか示さない。P2P（地震）だけ落ちていても
 *    heartbeat は届くので、backend が heartbeat に載せる取得の成否（earthquake_ok / tsunami_ok）
 *    が両方 true のときだけ時刻を進め、false なら失敗として出す
 * 2. Service Worker が通信失敗時にキャッシュから返した応答（X-SW-Cache: 1）は
 *    「今の成功」ではない。保存時刻（X-SW-Cached-At）を「保存済みのデータ」として持ち、
 *    津波は呼び出し側へ渡さない（古い [] で表示中の津波警報を消さない）
 */

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

const CACHED_AT = '2026-10-21T00:00:00.000Z';

function response(body: unknown, cached: boolean) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(cached ? { [SW_CACHE_HEADER]: '1', [SW_CACHED_AT_HEADER]: CACHED_AT } : {}),
    json: async () => body,
  };
}

function routeFetch(opts: { earthquakeCached?: boolean; tsunamiCached?: boolean } = {}) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/tsunami/active')) return response([], !!opts.tsunamiCached);
    return response([{ id: 'eq1' }], !!opts.earthquakeCached);
  }) as unknown as typeof fetch;
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function openStream() {
  act(() => {
    FakeEventSource.instances[0].onopen?.();
  });
}

function emit(type: string, data: unknown) {
  act(() => {
    FakeEventSource.instances[FakeEventSource.instances.length - 1].emit(type, data);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T10:00:00+09:00'));
  FakeEventSource.instances = [];
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  routeFetch();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SSE heartbeat は上流の取得の成否で時刻を進める', () => {
  it('P2P だけ落ちている heartbeat では「最新」にせず失敗を出す。両方取れたら進める', async () => {
    const { result } = renderHook(() => useEventStream({ lang: 'ja' }));
    openStream();
    await flush();
    const verifiedAt = result.current.lastSuccessAt;
    expect(verifiedAt).toBe(Date.now());

    await advance(30_000);
    emit('heartbeat', { time: 'x', clients: 1, earthquake_ok: false, tsunami_ok: true });
    expect(result.current.lastSuccessAt).toBe(verifiedAt);
    expect(result.current.lastFailed).toBe(true);

    await advance(30_000);
    emit('heartbeat', { time: 'x', clients: 1, earthquake_ok: true, tsunami_ok: true });
    expect(result.current.lastSuccessAt).toBe(Date.now());
    expect(result.current.lastFailed).toBe(false);
  });

  it('津波が落ちている間は、地震イベントが届いても時刻を進めない', async () => {
    const { result } = renderHook(() => useEventStream({ lang: 'ja' }));
    openStream();
    await flush();
    const verifiedAt = result.current.lastSuccessAt;

    await advance(30_000);
    emit('heartbeat', { time: 'x', clients: 1, earthquake_ok: true, tsunami_ok: false });
    await advance(10_000);
    emit('earthquake', { earthquakes: [{ id: 'eq2' }], updated_at: 'x' });
    expect(result.current.lastSuccessAt).toBe(verifiedAt);
    expect(result.current.lastFailed).toBe(true);
  });

  it('P2P が戻って地震イベントが届けば（津波は取れている）時刻を進める', async () => {
    const { result } = renderHook(() => useEventStream({ lang: 'ja' }));
    openStream();
    await flush();
    await advance(30_000);
    emit('heartbeat', { time: 'x', clients: 1, earthquake_ok: false, tsunami_ok: true });
    await advance(10_000);
    emit('earthquake', { earthquakes: [{ id: 'eq2' }], updated_at: 'x' });
    expect(result.current.lastSuccessAt).toBe(Date.now());
    expect(result.current.lastFailed).toBe(false);
  });
});

describe('SW のキャッシュ応答を「今の成功」にしない', () => {
  it('両方キャッシュなら時刻を進めず、保存時刻を持ち、データは渡さない', async () => {
    routeFetch({ earthquakeCached: true, tsunamiCached: true });
    const onEarthquake = vi.fn();
    const onTsunami = vi.fn();
    const { result } = renderHook(() => useEventStream({ lang: 'ja', onEarthquake, onTsunami }));
    openStream();
    await flush();
    expect(result.current.lastSuccessAt).toBeNull();
    expect(result.current.lastFailed).toBe(true);
    expect(result.current.savedAt).toBe(Date.parse(CACHED_AT));
    expect(onTsunami).not.toHaveBeenCalled();
    expect(onEarthquake).not.toHaveBeenCalled();
  });

  it('津波だけキャッシュなら、地震は渡すが成功にはしない（津波の古い [] は渡さない）', async () => {
    routeFetch({ tsunamiCached: true });
    const onEarthquake = vi.fn();
    const onTsunami = vi.fn();
    const { result } = renderHook(() => useEventStream({ lang: 'ja', onEarthquake, onTsunami }));
    openStream();
    await flush();
    expect(onEarthquake).toHaveBeenCalledTimes(1);
    expect(onTsunami).not.toHaveBeenCalled();
    expect(result.current.lastSuccessAt).toBeNull();
    expect(result.current.savedAt).toBe(Date.parse(CACHED_AT));
  });

  it('その後に実際に取れたら保存済みの表示を消して時刻を進める', async () => {
    routeFetch({ earthquakeCached: true, tsunamiCached: true });
    const { result } = renderHook(() => useEventStream({ lang: 'ja' }));
    openStream();
    await flush();
    expect(result.current.savedAt).not.toBeNull();

    routeFetch();
    act(() => {
      result.current.refresh();
    });
    await flush();
    expect(result.current.savedAt).toBeNull();
    expect(result.current.lastSuccessAt).toBe(Date.now());
  });
});
