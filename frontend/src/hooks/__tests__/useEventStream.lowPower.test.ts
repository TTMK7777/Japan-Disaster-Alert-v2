import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEventStream, LOW_POWER_POLL_INTERVAL_MS } from '../useEventStream';

/**
 * 低電力・低回線モード（lowPower: true）。
 *
 * 停電で充電できない訪日客向けに、SSE の常時接続をやめて 5 分ごとのポーリングに切り替える。
 * **津波は取りこぼさない**: 1 回の取得で地震と津波（/api/v1/tsunami/active）を両方取る。
 * 「最後に取得できた時刻」は**両方そろって成功したときだけ**進め、失敗したら書き換えない。
 *
 * タイマー系なので fake timers で回す。waitFor は fake timers 下でハングするため使わず、
 * advanceTimersByTimeAsync の後に直接 assert する。
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

  /** テストからイベントを届ける */
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function setHidden(value: boolean) {
  Object.defineProperty(document, 'hidden', { value, configurable: true });
}

const FIVE_MIN = 5 * 60 * 1000;
type FetchMock = ReturnType<typeof vi.fn>;
const fetchMock = () => global.fetch as unknown as FetchMock;
const urls = () => fetchMock().mock.calls.map((c) => String(c[0]));
const countOf = (path: string) => urls().filter((u) => u.includes(path)).length;

/** 地震と津波を URL で振り分ける fetch。津波だけ落とす等に使う */
function routeFetch(opts: { earthquakeOk?: boolean; tsunamiOk?: boolean; tsunamis?: unknown[] } = {}) {
  const { earthquakeOk = true, tsunamiOk = true, tsunamis = [] } = opts;
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/tsunami/active')) {
      return { ok: tsunamiOk, status: tsunamiOk ? 200 : 500, json: async () => tsunamis };
    }
    return { ok: earthquakeOk, status: earthquakeOk ? 200 : 500, json: async () => [{ id: 'eq1' }] };
  }) as unknown as typeof fetch;
}

/** 保留中の Promise を流す（fake timers 下で await の連鎖を進める） */
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

describe('useEventStream — 低電力モード', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    routeFetch();
    setOnline(true);
    setHidden(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('既定の間隔は 5 分', () => {
    expect(LOW_POWER_POLL_INTERVAL_MS).toBe(FIVE_MIN);
  });

  it('SSE を開かず、地震と津波を両方すぐ取りに行く', async () => {
    renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(countOf('/api/v1/earthquakes')).toBe(1);
    expect(countOf('/api/v1/tsunami/active')).toBe(1);
  });

  it('次の取得はちょうど 5 分後（それより前には取らない）', async () => {
    renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();

    await advance(FIVE_MIN - 1);
    expect(countOf('/api/v1/tsunami/active')).toBe(1);

    await advance(1);
    expect(countOf('/api/v1/tsunami/active')).toBe(2);
    expect(countOf('/api/v1/earthquakes')).toBe(2);

    // 15 分で初回 + 3 回
    await advance(FIVE_MIN * 2);
    expect(countOf('/api/v1/tsunami/active')).toBe(4);
  });

  it('取得した津波を onTsunami に渡す（低電力でも津波の全画面警報が出る）', async () => {
    routeFetch({ tsunamis: [{ id: 't1', grade: 'MajorWarning' }] });
    const onTsunami = vi.fn();
    renderHook(() => useEventStream({ lang: 'ja', lowPower: true, onTsunami }));
    await flush();

    expect(onTsunami).toHaveBeenCalledTimes(1);
    expect(onTsunami.mock.calls[0][0].tsunamis).toEqual([{ id: 't1', grade: 'MajorWarning' }]);
  });

  it('一度も取れていなければ lastSuccessAt は null、成功で時刻が入る', async () => {
    routeFetch({ earthquakeOk: false });
    const { result } = renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();
    expect(result.current.lastSuccessAt).toBeNull();
    expect(result.current.lastFailed).toBe(true);

    routeFetch();
    await advance(FIVE_MIN);
    expect(result.current.lastSuccessAt).toBe(Date.now());
    expect(result.current.lastFailed).toBe(false);
  });

  it('失敗しても成功時刻を書き換えない（失敗フラグだけ立てる）', async () => {
    const { result } = renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();
    const firstSuccess = result.current.lastSuccessAt;
    expect(firstSuccess).not.toBeNull();
    expect(result.current.lastFailed).toBe(false);

    routeFetch({ earthquakeOk: false, tsunamiOk: false });
    await advance(FIVE_MIN);
    expect(result.current.lastSuccessAt).toBe(firstSuccess);
    expect(result.current.lastFailed).toBe(true);

    // 失敗が続いても同じ
    await advance(FIVE_MIN);
    expect(result.current.lastSuccessAt).toBe(firstSuccess);
  });

  it('津波だけ失敗したら成功扱いにしない・津波なしと断定しない', async () => {
    routeFetch({ tsunamiOk: false });
    const onTsunami = vi.fn();
    const onEarthquake = vi.fn();
    const { result } = renderHook(() =>
      useEventStream({ lang: 'ja', lowPower: true, onTsunami, onEarthquake })
    );
    await flush();

    expect(onEarthquake).toHaveBeenCalledTimes(1); // 取れた地震は出す
    expect(onTsunami).not.toHaveBeenCalled();
    expect(result.current.lastSuccessAt).toBeNull();
    expect(result.current.lastFailed).toBe(true);
  });

  it('失敗が続いても間隔は 5 分のまま（短くも長くもならない）', async () => {
    routeFetch({ earthquakeOk: false, tsunamiOk: false });
    renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();

    for (let i = 2; i <= 6; i += 1) {
      await advance(FIVE_MIN - 1);
      expect(countOf('/api/v1/tsunami/active')).toBe(i - 1);
      await advance(1);
      expect(countOf('/api/v1/tsunami/active')).toBe(i);
    }
  });

  it('「今すぐ更新」は連打しても多重に取りに行かない', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    global.fetch = vi.fn(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();
    expect(result.current.refreshing).toBe(true);

    act(() => {
      result.current.refresh();
      result.current.refresh();
      result.current.refresh();
    });
    expect(countOf('/api/v1/tsunami/active')).toBe(1);

    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.refreshing).toBe(false);

    // 終わった後の「今すぐ更新」は通る
    act(() => {
      result.current.refresh();
    });
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(2);
  });

  it('取得中にバックグラウンドから戻っても、同じ取得を二重に出さない', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    global.fetch = vi.fn(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;

    renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(1);

    // まだ一度も成功していない＝復帰時は即取得の条件。だが取得中なので相乗りする
    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => {
      setHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(1);

    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(0);
    });
    // 予約は 1 本だけ（5 分後に 1 回）
    await advance(FIVE_MIN);
    expect(countOf('/api/v1/tsunami/active')).toBe(2);
  });

  it('「今すぐ更新」のあと、次の自動取得はそこから 5 分後', async () => {
    const { result } = renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();

    await advance(2 * 60 * 1000);
    act(() => {
      result.current.refresh();
    });
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(2);

    // 元の予定（初回から 5 分 = いまから 3 分後）では取らない
    await advance(FIVE_MIN - 1);
    expect(countOf('/api/v1/tsunami/active')).toBe(2);
    await advance(1);
    expect(countOf('/api/v1/tsunami/active')).toBe(3);
  });

  it('ポーリング中に圏外になったら止まり、復帰したら取りに行く', async () => {
    renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(1);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    await advance(FIVE_MIN * 3);
    expect(countOf('/api/v1/tsunami/active')).toBe(1);

    // 15 分経っているので復帰したらすぐ取る（SSE は開かない）
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(2);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('圏外の間は「今すぐ更新」も通信しない', async () => {
    const { result } = renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      result.current.refresh();
    });
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(1);
    expect(result.current.lastFailed).toBe(true);
  });

  it('5 分以内にバックグラウンドから戻っても、すぐには取らず残り時間で取る', async () => {
    renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();

    await advance(60 * 1000);
    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(60 * 1000);
    act(() => {
      setHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(1);

    // 初回から 5 分（= 復帰から 3 分）で取る
    await advance(3 * 60 * 1000 - 1);
    expect(countOf('/api/v1/tsunami/active')).toBe(1);
    await advance(1);
    expect(countOf('/api/v1/tsunami/active')).toBe(2);
  });

  it('前回が失敗なら、復帰時は 5 分待たずに取りに行く', async () => {
    routeFetch({ earthquakeOk: false });
    renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    routeFetch();
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(1);
  });

  it('オンにした瞬間: SSE を閉じ、直前に受信済みなら追加の取得をしない', async () => {
    const { rerender } = renderHook(
      ({ lowPower }) => useEventStream({ lang: 'ja', lowPower }),
      { initialProps: { lowPower: false } }
    );
    const stream = FakeEventSource.instances[0];
    act(() => {
      stream.onopen?.();
      stream.emit('heartbeat', { time: 'x', clients: 1 });
    });

    rerender({ lowPower: true });
    await flush();
    expect(stream.closed).toBe(true);
    expect(fetchMock()).not.toHaveBeenCalled();

    await advance(FIVE_MIN);
    expect(countOf('/api/v1/tsunami/active')).toBe(1);
  });

  it('津波を受信済みの状態でオンにしても、表示中の津波を消さない（空で上書きしない）', async () => {
    const onTsunami = vi.fn();
    const { rerender } = renderHook(
      ({ lowPower }) => useEventStream({ lang: 'ja', lowPower, onTsunami }),
      { initialProps: { lowPower: false } }
    );
    act(() => {
      FakeEventSource.instances[0].emit('tsunami', { tsunamis: [{ id: 't1' }], updated_at: 'x' });
    });
    expect(onTsunami).toHaveBeenCalledTimes(1);

    rerender({ lowPower: true });
    await flush();
    // 切替で onTsunami を空配列で呼ばない（次の取得まで前の情報を保つ）
    expect(onTsunami).toHaveBeenCalledTimes(1);
  });

  it('オフにした瞬間: ポーリングを止めて SSE に戻る', async () => {
    const { rerender } = renderHook(
      ({ lowPower }) => useEventStream({ lang: 'ja', lowPower }),
      { initialProps: { lowPower: true } }
    );
    await flush();
    const before = fetchMock().mock.calls.length;

    rerender({ lowPower: false });
    expect(FakeEventSource.instances).toHaveLength(1);
    await advance(FIVE_MIN * 3);
    expect(fetchMock().mock.calls.length).toBe(before);
  });

  it('トグル連打でも取得が増えない', async () => {
    const { rerender } = renderHook(
      ({ lowPower }) => useEventStream({ lang: 'ja', lowPower }),
      { initialProps: { lowPower: true } }
    );
    await flush();
    for (let i = 0; i < 10; i += 1) {
      rerender({ lowPower: i % 2 !== 0 });
    }
    await flush();
    expect(countOf('/api/v1/tsunami/active')).toBe(1);
  });

  it('通常モードでも SSE を受信したら最後に取得できた時刻が進む', () => {
    const { result } = renderHook(() => useEventStream({ lang: 'ja' }));
    expect(result.current.lastSuccessAt).toBeNull();
    act(() => {
      FakeEventSource.instances[0].emit('heartbeat', { time: 'x', clients: 1 });
    });
    expect(result.current.lastSuccessAt).toBe(Date.now());
  });

  it('次の自動更新の予定時刻を返す（圏外では null）', async () => {
    const { result } = renderHook(() => useEventStream({ lang: 'ja', lowPower: true }));
    await flush();
    expect(result.current.nextPollAt).toBe(Date.now() + FIVE_MIN);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.nextPollAt).toBeNull();
  });

  it('アンマウント後に返ってきた取得結果を反映しない', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    global.fetch = vi.fn(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;
    const onEarthquake = vi.fn();
    const { unmount } = renderHook(() =>
      useEventStream({ lang: 'ja', lowPower: true, onEarthquake })
    );
    await flush();
    unmount();
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onEarthquake).not.toHaveBeenCalled();
  });
});
