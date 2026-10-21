import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { LOW_POWER_STORAGE_KEY } from '@/hooks/useLowPowerMode';

/**
 * page.tsx の配線を本物のフック・コンポーネントのまま固定する結合テスト。
 *
 * 個々の部品（useDisplayPreferences / WarningBanner / useEventStream）には単体テストがあるが、
 * page.tsx で**つなぐ 1 行**（`onAreaCodeChange={selectPref}` 等）を消しても単体テストは全部緑のまま。
 * ここではその配線を通した結果（URL・fetch の引数・再マウント後の状態）を見る。
 *
 * 地図（Leaflet）は jsdom で動かないので next/dynamic だけ差し替える。
 */

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicStub() {
      return null;
    },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

type FetchMock = ReturnType<typeof vi.fn>;
const fetchMock = () => global.fetch as unknown as FetchMock;
const urls = () => fetchMock().mock.calls.map((c) => String(c[0]));
const countOf = (path: string) => urls().filter((u) => u.includes(path)).length;

function installFetch() {
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })) as unknown as typeof fetch;
}

function setUrl(pathAndQuery: string) {
  window.history.replaceState(null, '', pathAndQuery);
}

async function renderHome() {
  const { default: Home } = await import('../page');
  return render(<Home />);
}

function openWarningTab() {
  fireEvent.click(document.getElementById('tab-warning') as HTMLElement);
}


beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  localStorage.clear();
  installFetch();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  setUrl('/');
});

describe('page.tsx — ストレージ拒否', () => {
  it('localStorage へのアクセス自体が例外を投げても画面が落ちず、低電力トグルが効く', async () => {
    // Chrome の「Cookie をすべてブロック」等では window.localStorage の参照で SecurityError になる
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await renderHome();
    const toggle = await waitFor(() => {
      const el = document.getElementById('low-power-toggle');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // 言語選択（保存を伴う）も落ちない
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'en' } });
    expect(document.getElementById('low-power-toggle')).not.toBeNull();
  });
});

describe('page.tsx — 低電力モード', () => {
  const FIVE_MIN = 5 * 60 * 1000;

  async function flush() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it.each([
    ['オフ', false],
    ['オン', true],
  ])('低電力%sでも、警報タブの 5 分ごとの取得（特別警報を含む）は止まらない', async (_label, lowPower) => {
    vi.useFakeTimers();
    if (lowPower) localStorage.setItem(LOW_POWER_STORAGE_KEY, '1');
    await renderHome();
    await flush();
    openWarningTab();
    await flush();
    expect(countOf('/api/v1/alerts')).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIVE_MIN * 2);
    });
    expect(countOf('/api/v1/alerts')).toBe(3);
  });

  it('保存済みのオンで開くと SSE を開かず、津波を 5 分ごとに取りに行く', async () => {
    vi.useFakeTimers();
    localStorage.setItem(LOW_POWER_STORAGE_KEY, '1');
    await renderHome();
    await flush();

    expect(FakeEventSource.instances).toHaveLength(0);
    const tsunamiAtStart = countOf('/api/v1/tsunami/active');
    expect(tsunamiAtStart).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIVE_MIN);
    });
    expect(countOf('/api/v1/tsunami/active')).toBe(tsunamiAtStart + 1);
  });

  it('ヘッダーのボタン 1 回でオンになり、SSE を閉じてアニメーションを減らす', async () => {
    vi.useFakeTimers();
    await renderHome();
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);
    const main = document.getElementById('main-content') as HTMLElement;
    expect(main.classList.contains('low-power')).toBe(false);

    const toggle = document.getElementById('low-power-toggle') as HTMLElement;
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    await flush();

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(main.classList.contains('low-power')).toBe(true);
    expect(localStorage.getItem(LOW_POWER_STORAGE_KEY)).toBe('1');
  });

  it('どのタブを開いていてもトグルと最終取得表示が見える', async () => {
    vi.useFakeTimers();
    await renderHome();
    await flush();
    for (const tab of ['earthquake', 'warning', 'emergency', 'shelter']) {
      fireEvent.click(document.getElementById(`tab-${tab}`) as HTMLElement);
      await flush();
      expect(document.getElementById('low-power-toggle')).not.toBeNull();
      expect(screen.getByTestId('last-success')).toBeInTheDocument();
    }
  });
});
