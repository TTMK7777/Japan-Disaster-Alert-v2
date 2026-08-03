import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEventStream } from '../useEventStream';

/**
 * 圏外・バックグラウンドでの通信暴走を止めることを固定するテスト。
 *
 * 停電と圏外はこのアプリが最も要る場面で、同時に**最も電池が惜しい**場面でもある。
 * 以前は SSE の再接続が5回失敗したあと 30 秒間隔のポーリングが
 * 上限なし・停止条件なしで永久に走り続けていた（得る情報はゼロ）。
 *
 * 固定するのは以下:
 *  - 圏外では EventSource を開かず fetch もしない
 *  - タブが見えていないときも同じ
 *  - 復帰（online / visibilitychange）で再開する
 *  - ポーリングが失敗し続けたら間隔が伸びる
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

  /** テストから接続失敗を起こす */
  fail() {
    this.onerror?.();
  }
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function setHidden(value: boolean) {
  Object.defineProperty(document, 'hidden', { value, configurable: true });
}

describe('useEventStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;
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

  it('オンラインなら SSE 接続を開く', () => {
    renderHook(() => useEventStream({ lang: 'ja' }));

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('圏外では SSE を開かず fetch もしない', () => {
    setOnline(false);

    const { result } = renderHook(() => useEventStream({ lang: 'ja' }));

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.mode).toBe('disconnected');
  });

  it('タブが見えていなければ SSE を開かず fetch もしない', () => {
    setHidden(true);

    renderHook(() => useEventStream({ lang: 'ja' }));

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('圏外になったら開いていた接続を閉じる', async () => {
    renderHook(() => useEventStream({ lang: 'ja' }));
    const stream = FakeEventSource.instances[0];

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(stream.closed).toBe(true);
  });

  it('復帰したら再接続する', () => {
    setOnline(false);
    renderHook(() => useEventStream({ lang: 'ja' }));
    expect(FakeEventSource.instances).toHaveLength(0);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('タブが再び見えたら再接続する', () => {
    setHidden(true);
    renderHook(() => useEventStream({ lang: 'ja' }));
    expect(FakeEventSource.instances).toHaveLength(0);

    act(() => {
      setHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('SSE が失敗し続けても、圏外ならポーリングに落ちない', async () => {
    vi.useFakeTimers();
    renderHook(() => useEventStream({ lang: 'ja' }));

    // 再接続上限（5回）を超えるまで失敗させる。途中で圏外になったとする
    setOnline(false);
    await act(async () => {
      for (let i = 0; i < 8; i += 1) {
        FakeEventSource.instances[FakeEventSource.instances.length - 1]?.fail();
        await vi.advanceTimersByTimeAsync(31000);
      }
    });

    // ポーリングの fetch が一度も走らないこと
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ポーリングが失敗し続けると間隔が伸びる', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;

    renderHook(() => useEventStream({ lang: 'ja', fallbackInterval: 1000 }));

    // SSE を上限まで失敗させてポーリングへ移行させる
    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        FakeEventSource.instances[FakeEventSource.instances.length - 1]?.fail();
        await vi.advanceTimersByTimeAsync(31000);
      }
    });

    expect(global.fetch).toHaveBeenCalled();
    const afterSwitch = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    // 等間隔（1秒）なら 10 秒で 10 回走る。バックオフが効いていれば大幅に少ない
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    const polls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length - afterSwitch;

    expect(polls).toBeLessThan(5);
  });

  it('ポーリング中に圏外になったら次の周回で止まる', async () => {
    vi.useFakeTimers();
    renderHook(() => useEventStream({ lang: 'ja', fallbackInterval: 1000 }));

    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        FakeEventSource.instances[FakeEventSource.instances.length - 1]?.fail();
        await vi.advanceTimersByTimeAsync(31000);
      }
    });
    expect(global.fetch).toHaveBeenCalled();

    setOnline(false);
    const before = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600000); // 10分
    });

    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
  });
});
