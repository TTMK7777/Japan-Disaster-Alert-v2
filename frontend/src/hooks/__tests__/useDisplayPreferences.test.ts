import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDisplayPreferences, LANGUAGE_STORAGE_KEY } from '../useDisplayPreferences';

/**
 * 表示言語と地域の決定・保存・URL 同期。
 *
 * 優先順位: URL の lang > 利用者が以前選んだ言語（保存値）> ブラウザ言語の推定。
 * **URL 由来の値は保存しない。** 宿の QR（`?lang=ko`）を一度読んだだけで、
 * その端末の以後の既定言語が韓国語に固定されてしまうため。
 * 利用者が画面で選び直したときだけ保存し、URL もその状態に合わせる（共有リンク用）。
 */

function setUrl(pathAndQuery: string) {
  window.history.replaceState(null, '', pathAndQuery);
}

function mockBrowserLanguages(langs: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(langs);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(langs[0] ?? '');
}

beforeEach(() => {
  localStorage.clear();
  setUrl('/');
  mockBrowserLanguages(['fr-FR']);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  setUrl('/');
});

describe('useDisplayPreferences — 初期言語の優先順位', () => {
  it('URL も保存値も無ければブラウザ言語から推定する（従来どおり）', () => {
    const { result } = renderHook(() => useDisplayPreferences());
    expect(result.current.language).toBe('fr');
  });

  it('保存値があればブラウザ言語より保存値（従来どおり）', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'th');
    const { result } = renderHook(() => useDisplayPreferences());
    expect(result.current.language).toBe('th');
  });

  it('URL の lang は保存値より優先する', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'th');
    setUrl('/?lang=ko');
    const { result } = renderHook(() => useDisplayPreferences());
    expect(result.current.language).toBe('ko');
  });

  it('URL の lang はブラウザ言語より優先する', () => {
    setUrl('/?lang=KO-kr');
    const { result } = renderHook(() => useDisplayPreferences());
    expect(result.current.language).toBe('ko');
  });

  it('URL の lang が無効なら保存値 → ブラウザ推定に落ちる', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'th');
    setUrl('/?lang=xx');
    const { result, unmount } = renderHook(() => useDisplayPreferences());
    expect(result.current.language).toBe('th');
    unmount();

    localStorage.clear();
    const second = renderHook(() => useDisplayPreferences());
    expect(second.result.current.language).toBe('fr');
  });

  it('<html lang> は許可リストを通った値になる', () => {
    setUrl('/?lang=zh-hant');
    renderHook(() => useDisplayPreferences());
    expect(document.documentElement.lang).toBe('zh-TW');
  });
});

describe('useDisplayPreferences — 保存', () => {
  it('URL 由来の言語は保存しない（保存値も上書きしない）', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'th');
    setUrl('/?lang=ko');
    renderHook(() => useDisplayPreferences());
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('th');
  });

  it('URL 由来の言語は、保存値が無い端末でも保存しない', () => {
    setUrl('/?lang=ko');
    renderHook(() => useDisplayPreferences());
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it('URL 指定で開いた後でも、利用者が画面で選び直したら保存する', () => {
    setUrl('/?lang=ko');
    const { result } = renderHook(() => useDisplayPreferences());
    act(() => result.current.selectLanguage('vi'));
    expect(result.current.language).toBe('vi');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('vi');
  });

  it('URL 指定が無いときの保存は従来どおり（推定した言語を保存する）', () => {
    renderHook(() => useDisplayPreferences());
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
  });

  it('URL 由来の地域は保存しない', () => {
    setUrl('/?pref=260000');
    renderHook(() => useDisplayPreferences());
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      expect(localStorage.getItem(key)).not.toContain('260000');
    }
  });
});

describe('useDisplayPreferences — 地域', () => {
  it('URL の pref が有効なら採用する', () => {
    setUrl('/?pref=260000');
    const { result } = renderHook(() => useDisplayPreferences());
    expect(result.current.prefCode).toBe('260000');
  });

  it('URL の pref が無効なら null（WarningBanner の既定に任せる）', () => {
    setUrl('/?pref=16000');
    const { result } = renderHook(() => useDisplayPreferences());
    expect(result.current.prefCode).toBeNull();
  });

  it('片方だけの指定はもう片方に影響しない', () => {
    setUrl('/?pref=016000');
    const { result } = renderHook(() => useDisplayPreferences());
    expect(result.current.prefCode).toBe('016000');
    expect(result.current.language).toBe('fr');
  });
});

describe('useDisplayPreferences — URL 同期', () => {
  it('開いただけでは URL を書き換えない', () => {
    setUrl('/?lang=ko&utm_source=qr');
    const spy = vi.spyOn(window.history, 'replaceState');
    renderHook(() => useDisplayPreferences());
    expect(spy).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?lang=ko&utm_source=qr');
  });

  it('言語を選び直すと lang を書き換え、他のクエリと hash は残す', () => {
    setUrl('/?utm_source=qr&lang=ko&pref=260000#top');
    const { result } = renderHook(() => useDisplayPreferences());
    act(() => result.current.selectLanguage('zh-TW'));
    expect(window.location.search).toBe('?utm_source=qr&lang=zh-TW&pref=260000');
    expect(window.location.hash).toBe('#top');
  });

  it('URL に lang が無くても、選び直したら付ける', () => {
    setUrl('/?pref=260000');
    const { result } = renderHook(() => useDisplayPreferences());
    act(() => result.current.selectLanguage('ko'));
    expect(window.location.search).toBe('?pref=260000&lang=ko');
  });

  it('地域を選び直すと pref を書き換える', () => {
    setUrl('/?lang=ko');
    const { result } = renderHook(() => useDisplayPreferences());
    act(() => result.current.selectPref('270000'));
    expect(result.current.prefCode).toBe('270000');
    expect(window.location.search).toBe('?lang=ko&pref=270000');
  });

  it('許可リストに無い値は状態にも URL にも入れない', () => {
    const { result } = renderHook(() => useDisplayPreferences());
    act(() => result.current.selectLanguage('xx'));
    act(() => result.current.selectPref('999999'));
    expect(result.current.language).toBe('fr');
    expect(result.current.prefCode).toBeNull();
    expect(window.location.search).toBe('');
  });
});
