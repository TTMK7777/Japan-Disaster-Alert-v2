import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readStorage, writeStorage } from '../safeStorage';
import { useTheme } from '@/hooks/useTheme';
import { useDisplayPreferences } from '@/hooks/useDisplayPreferences';

/**
 * ストレージが拒否された端末で画面を落とさない。
 *
 * Chrome の「Cookie をすべてブロック」等では window.localStorage を参照しただけで
 * SecurityError になる。以前は useTheme / useDisplayPreferences がマウント時に
 * 素の localStorage を呼んでおり、画面全体が真っ白になっていた（実ブラウザで確認）。
 */

function denyStorage() {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('safeStorage', () => {
  it('普段は読み書きできる', () => {
    writeStorage('k', 'v');
    expect(readStorage('k')).toBe('v');
  });

  it('拒否されたら読みは null、書きは黙って諦める', () => {
    denyStorage();
    expect(readStorage('k')).toBeNull();
    expect(() => writeStorage('k', 'v')).not.toThrow();
  });

  it('拒否されても useTheme が落ちない', () => {
    denyStorage();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
  });

  it('拒否されても useDisplayPreferences が落ちない', () => {
    denyStorage();
    const { result } = renderHook(() => useDisplayPreferences());
    act(() => result.current.selectLanguage('en'));
    expect(result.current.language).toBe('en');
  });
});
