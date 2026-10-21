import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLowPowerMode, LOW_POWER_STORAGE_KEY } from '../useLowPowerMode';
import { useBatterySuggestion, LOW_BATTERY_THRESHOLD } from '../useBatterySuggestion';

/**
 * 低電力モードの状態（保存つき）と、電池残量からの提案。
 *
 * **ストレージが拒否されても画面を落とさない。** Safari のプライベートブラウズや
 * 企業端末のポリシーでは localStorage へのアクセス自体が例外を投げる。
 * 災害時に「設定を保存できない」ことでアプリ全体が真っ白になるのは許されない。
 */

describe('useLowPowerMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('既定はオフ', () => {
    const { result } = renderHook(() => useLowPowerMode());
    expect(result.current.lowPower).toBe(false);
  });

  it('保存済みのオンを復元する', () => {
    localStorage.setItem(LOW_POWER_STORAGE_KEY, '1');
    const { result } = renderHook(() => useLowPowerMode());
    expect(result.current.lowPower).toBe(true);
  });

  it('切り替えたら保存し、再マウントしても残る', () => {
    const first = renderHook(() => useLowPowerMode());
    act(() => first.result.current.toggleLowPower());
    expect(first.result.current.lowPower).toBe(true);
    expect(localStorage.getItem(LOW_POWER_STORAGE_KEY)).toBe('1');
    first.unmount();

    const second = renderHook(() => useLowPowerMode());
    expect(second.result.current.lowPower).toBe(true);

    act(() => second.result.current.toggleLowPower());
    expect(localStorage.getItem(LOW_POWER_STORAGE_KEY)).toBe('0');
  });

  it('知らない保存値はオフとして扱う', () => {
    localStorage.setItem(LOW_POWER_STORAGE_KEY, 'yes');
    const { result } = renderHook(() => useLowPowerMode());
    expect(result.current.lowPower).toBe(false);
  });

  it('ストレージの読み書きが例外を投げても落ちず、画面上の切替は効く', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'QuotaExceededError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useLowPowerMode());
    expect(result.current.lowPower).toBe(false);
    act(() => result.current.toggleLowPower());
    expect(result.current.lowPower).toBe(true);
  });

  it('連打しても最後の状態が保存される', () => {
    const { result } = renderHook(() => useLowPowerMode());
    act(() => {
      for (let i = 0; i < 7; i += 1) result.current.toggleLowPower();
    });
    expect(result.current.lowPower).toBe(true);
    expect(localStorage.getItem(LOW_POWER_STORAGE_KEY)).toBe('1');
  });
});

describe('useBatterySuggestion', () => {
  type FakeBattery = EventTarget & { level: number; charging: boolean };
  function installBattery(level: number): FakeBattery {
    const battery = Object.assign(new EventTarget(), { level, charging: false }) as FakeBattery;
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockResolvedValue(battery),
      configurable: true,
    });
    return battery;
  }
  function removeBattery() {
    // jsdom には元々無い。前のテストで足した分を消す
    delete (navigator as unknown as { getBattery?: unknown }).getBattery;
  }

  afterEach(() => {
    removeBattery();
    vi.restoreAllMocks();
  });

  it('しきい値は 20%', () => {
    expect(LOW_BATTERY_THRESHOLD).toBe(0.2);
  });

  it('Battery Status API が無い環境（iOS Safari 等）では何もしない', async () => {
    removeBattery();
    const { result } = renderHook(() => useBatterySuggestion(false));
    await act(async () => {});
    expect(result.current.suggest).toBe(false);
  });

  it('残量 20% 未満なら提案する', async () => {
    installBattery(0.19);
    const { result } = renderHook(() => useBatterySuggestion(false));
    await act(async () => {});
    expect(result.current.suggest).toBe(true);
  });

  it('ちょうど 20% では提案しない', async () => {
    installBattery(0.2);
    const { result } = renderHook(() => useBatterySuggestion(false));
    await act(async () => {});
    expect(result.current.suggest).toBe(false);
  });

  it('すでに低電力モードなら提案しない', async () => {
    installBattery(0.05);
    const { result } = renderHook(() => useBatterySuggestion(true));
    await act(async () => {});
    expect(result.current.suggest).toBe(false);
  });

  it('残量が減ってきたら（levelchange）提案する', async () => {
    const battery = installBattery(0.5);
    const { result } = renderHook(() => useBatterySuggestion(false));
    await act(async () => {});
    expect(result.current.suggest).toBe(false);

    await act(async () => {
      battery.level = 0.1;
      battery.dispatchEvent(new Event('levelchange'));
    });
    expect(result.current.suggest).toBe(true);
  });

  it('「今はしない」で閉じたら、同じ画面では再び出さない', async () => {
    const battery = installBattery(0.1);
    const { result } = renderHook(() => useBatterySuggestion(false));
    await act(async () => {});
    act(() => result.current.dismiss());
    expect(result.current.suggest).toBe(false);

    await act(async () => {
      battery.level = 0.05;
      battery.dispatchEvent(new Event('levelchange'));
    });
    expect(result.current.suggest).toBe(false);
  });

  it('getBattery が失敗しても落ちない', async () => {
    Object.defineProperty(navigator, 'getBattery', {
      value: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
      configurable: true,
    });
    const { result } = renderHook(() => useBatterySuggestion(false));
    await act(async () => {});
    expect(result.current.suggest).toBe(false);
  });
});
