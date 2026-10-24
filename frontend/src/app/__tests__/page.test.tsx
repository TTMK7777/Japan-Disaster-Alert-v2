import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react';
import { LOW_POWER_STORAGE_KEY } from '@/hooks/useLowPowerMode';
import { getTranslation } from '@/i18n/translations';
import { NATIONAL_TRAVELER_URL, PREFECTURE_DISASTER_LINKS } from '@/lib/prefectureDisasterLinks';

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

/** 警報タブの地域セレクタ（ヘッダーの言語セレクタも combobox なのでパネル内に絞る） */
async function findAreaSelect(): Promise<HTMLSelectElement> {
  const panel = document.getElementById('tabpanel-warning') as HTMLElement;
  return (await within(panel).findByRole('combobox')) as HTMLSelectElement;
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

describe('page.tsx — 警報タブの地域セレクタと URL の配線', () => {
  it('?pref= で開き、セレクタで選び直すと URL と取得先が変わり、再マウントしても残る', async () => {
    setUrl('/?pref=260000&utm=x#h');
    const first = await renderHome();
    openWarningTab();

    // URL の地域（京都）で取りに行く
    await waitFor(() => expect(urls().some((u) => u.includes('area_code=260000'))).toBe(true));
    const select = await findAreaSelect();
    expect(select.value).toBe('260000');

    fireEvent.change(select, { target: { value: '270000' } });

    // URL: pref だけが変わり、他のクエリと hash は残る
    const params = new URLSearchParams(window.location.search);
    expect(params.get('pref')).toBe('270000');
    expect(params.get('utm')).toBe('x');
    expect(window.location.hash).toBe('#h');

    // 取得先も大阪に変わる
    await waitFor(() => expect(urls().some((u) => u.includes('area_code=270000'))).toBe(true));

    // 再マウント（再読み込み相当）しても大阪のまま
    first.unmount();
    fetchMock().mockClear();
    await renderHome();
    openWarningTab();
    await waitFor(() => expect(countOf('/api/v1/alerts')).toBeGreaterThan(0));
    const alertUrls = urls().filter((u) => u.includes('/api/v1/alerts'));
    expect(alertUrls.every((u) => u.includes('area_code=270000'))).toBe(true);
    expect((await findAreaSelect()).value).toBe('270000');
  });
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
    // 地域が決まっていないと警報は取りに行かない（B8）ので地域を指定して開く
    setUrl('/?pref=130000');
    await renderHome();
    await flush();
    openWarningTab();
    await flush();
    const atOpen = countOf('/api/v1/alerts');
    expect(atOpen).toBeGreaterThan(0);

    // 警報タブを開いている間は WarningBanner だけが取る（ページの帯用の取得は止まる＝二重取得しない）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIVE_MIN * 2);
    });
    expect(countOf('/api/v1/alerts')).toBe(atOpen + 2);
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

  it('津波だけ取れていない間は、言語切替で地震が取れても失敗表示を消さない', async () => {
    vi.useFakeTimers();
    localStorage.setItem(LOW_POWER_STORAGE_KEY, '1');
    localStorage.setItem('disaster-app-lang', 'ja');
    // 津波: 最初の 2 回（EmergencyAlert の初回取得とポーリングの初回）は 503、以降は返ってこない
    let tsunamiCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/tsunami/active')) {
        tsunamiCalls += 1;
        if (tsunamiCalls <= 2) return { ok: false, status: 503, json: async () => ({}) };
        return new Promise(() => {});
      }
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;

    await renderHome();
    await flush();
    expect(screen.getByTestId('fetch-failed')).toBeInTheDocument();
    expect(screen.getByTestId('last-success')).toHaveTextContent(getTranslation('ja', 'freshness.never'));

    // 言語を切り替える → page 側の地震の取り直しは成功する（津波は取れていない）
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'en' } });
    await flush();
    expect(countOf('/api/v1/earthquakes?lang=en')).toBeGreaterThan(0);
    expect(screen.getByTestId('fetch-failed')).toBeInTheDocument();
    expect(screen.getByTestId('last-success')).toHaveTextContent(getTranslation('en', 'freshness.never'));
  });

  it('どのタブを開いていてもトグルと最終取得表示が見える', async () => {
    vi.useFakeTimers();
    await renderHome();
    await flush();
    for (const tab of ['earthquake', 'warning', 'emergency', 'shelter', 'conversation']) {
      fireEvent.click(document.getElementById(`tab-${tab}`) as HTMLElement);
      await flush();
      expect(document.getElementById('low-power-toggle')).not.toBeNull();
      expect(screen.getByTestId('last-success')).toBeInTheDocument();
    }
  });
});

describe('page.tsx — 「このアプリが扱う範囲」の帯', () => {
  /** 帯の中のリンク（警報タブのボタンと区別するため帯の中に絞る） */
  const bandLink = () => within(screen.getByTestId('scope-notice')).getByRole('link');

  it('どのタブでも、タブの中身より前（フッターではない位置）に出る', async () => {
    localStorage.setItem('disaster-app-lang', 'ja');
    await renderHome();
    for (const tab of ['earthquake', 'warning', 'emergency', 'shelter', 'conversation']) {
      fireEvent.click(document.getElementById(`tab-${tab}`) as HTMLElement);
      const band = await screen.findByTestId('scope-notice');
      expect(band).toHaveTextContent(getTranslation('ja', 'scope.notCovered'));
      expect(band.closest('footer')).toBeNull();
      const following = (el: Element | null) =>
        !!el && (band.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      expect(following(document.querySelector('footer')), tab).toBe(true);
      // タブの中身より前にある。緊急連絡・避難所タブはこのモック（全 API が []）では
      // ErrorBoundary の代替表示になるので、代替表示（role=alert）も「中身」として扱う
      const content =
        document.getElementById(`tabpanel-${tab}`) ??
        document.querySelector('#main-content [role="alert"]');
      expect(content, `${tab} の中身`).not.toBeNull();
      expect(following(content), tab).toBe(true);
    }
  });

  it('言語を切り替えると帯もその言語になる', async () => {
    await renderHome();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'ko' } });
    await waitFor(() =>
      expect(screen.getByTestId('scope-notice')).toHaveTextContent(getTranslation('ko', 'scope.notCovered'))
    );
  });

  it('?pref= が無ければ全国リンク、?pref= があればその県、警報タブで選び直すと追従する', async () => {
    const first = await renderHome();
    await waitFor(() => expect(bandLink()).toHaveAttribute('href', NATIONAL_TRAVELER_URL));
    first.unmount();

    setUrl('/?pref=471000&lang=ja');
    await renderHome();
    const okinawa = PREFECTURE_DISASTER_LINKS.find((l) => l.pref === '47')!;
    await waitFor(() => expect(bandLink()).toHaveAttribute('href', okinawa.disasterUrl));

    openWarningTab();
    fireEvent.change(await findAreaSelect(), { target: { value: '260000' } });
    const kyoto = PREFECTURE_DISASTER_LINKS.find((l) => l.pref === '26')!;
    await waitFor(() => expect(bandLink()).toHaveAttribute('href', kyoto.disasterUrl));
  });
});

describe('page.tsx — 地域の明示（B8）', () => {
  it('地域が無ければ、どのタブでも警報を取りに行かず、上部と警報タブで「地域を選んでください」を出す', async () => {
    localStorage.setItem('disaster-app-lang', 'ja');
    await renderHome();
    const picker = await screen.findByTestId('region-picker');
    expect(picker).toHaveTextContent(getTranslation('ja', 'region.choose'));
    expect(screen.queryByTestId('region-bar')).toBeNull();
    openWarningTab();
    expect(await screen.findByTestId('warning-choose-region')).toBeInTheDocument();
    await act(async () => {});
    expect(countOf('/api/v1/alerts')).toBe(0);
    // 地震は全国なので影響なし
    expect(countOf('/api/v1/earthquakes')).toBeGreaterThan(0);
  });

  it('上部で選ぶと「{pref}の情報を表示中」になり、警報タブもその地域で取り、次に開いたときも残る', async () => {
    localStorage.setItem('disaster-app-lang', 'en');
    const first = await renderHome();
    fireEvent.change(await screen.findByRole('combobox', { name: getTranslation('en', 'warning.selectArea') }), {
      target: { value: '270000' },
    });
    expect(await screen.findByTestId('region-bar')).toHaveTextContent('Showing information for Osaka');
    expect(new URLSearchParams(window.location.search).get('pref')).toBe('270000');
    openWarningTab();
    await waitFor(() => expect(urls().some((u) => u.includes('area_code=270000'))).toBe(true));
    expect(urls().filter((u) => u.includes('/api/v1/alerts')).every((u) => u.includes('area_code=270000'))).toBe(true);

    first.unmount();
    setUrl('/');
    await renderHome();
    expect(await screen.findByTestId('region-bar')).toHaveTextContent('Showing information for Osaka');
  });
});

describe('page.tsx — 特別警報の帯（B8）', () => {
  const SPECIAL = [
    { id: 'x', type: 'special_warning', title: '大雨特別警報', description: '', area: '東京地方',
      issued_at: '2026-10-22T05:00:00+09:00', severity: 'extreme', is_continuing: true },
  ];

  function installAlerts(body: unknown) {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return { ok: true, status: 200, json: async () => (url.includes('/api/v1/alerts') ? body : []) };
    }) as unknown as typeof fetch;
  }

  it('選択中の地域で特別警報（継続中）が出ていれば、どのタブでも上部に帯が出て「警報を見る」で警報タブへ移る', async () => {
    installAlerts(SPECIAL);
    setUrl('/?pref=130000&lang=ja');
    await renderHome();
    const band = await screen.findByTestId('special-warning-band');
    expect(band).toHaveTextContent('東京都に特別警報が出ています');
    for (const tab of ['emergency', 'shelter', 'earthquake']) {
      fireEvent.click(document.getElementById(`tab-${tab}`) as HTMLElement);
      expect(screen.getByTestId('special-warning-band')).toBeInTheDocument();
    }
    fireEvent.click(document.getElementById('special-warning-view') as HTMLElement);
    expect(document.getElementById('tab-warning')).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(document.getElementById('tab-warning'));
    // 帯はタブのナビより前（sticky の塊の先頭）
    const nav = document.querySelector('nav') as HTMLElement;
    expect(screen.getByTestId('special-warning-band').compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('警報・注意報だけなら帯は出ない', async () => {
    installAlerts([{ ...SPECIAL[0], id: 'y', severity: 'high', type: 'warning' }]);
    setUrl('/?pref=130000&lang=ja');
    await renderHome();
    await waitFor(() => expect(countOf('/api/v1/alerts')).toBeGreaterThan(0));
    await act(async () => {});
    expect(screen.queryByTestId('special-warning-band')).toBeNull();
  });

  it('地域が未選択なら帯は出ない（取りに行かない）', async () => {
    installAlerts(SPECIAL);
    await renderHome();
    await screen.findByTestId('region-picker');
    await act(async () => {});
    expect(screen.queryByTestId('special-warning-band')).toBeNull();
    expect(countOf('/api/v1/alerts')).toBe(0);
  });
});

describe('page.tsx — 会話タブ（B10b）', () => {
  const ALL_TABS = ['earthquake', 'warning', 'emergency', 'shelter', 'conversation'];

  it('5 つ目のタブ「会話」があり、開くと会話カードと「翻訳は確認中」の注記が出る', async () => {
    localStorage.setItem('disaster-app-lang', 'ja');
    await renderHome();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.id)).toEqual(ALL_TABS.map((t) => `tab-${t}`));
    const tab = document.getElementById('tab-conversation') as HTMLElement;
    expect(tab).toHaveTextContent(getTranslation('ja', 'conversation'));
    fireEvent.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    const panel = document.getElementById('tabpanel-conversation') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-conversation');
    expect(within(panel).getByTestId('conv-mode-visitor')).toBeInTheDocument();
    const note = within(panel).getByTestId('conv-review-note');
    expect(note).toHaveTextContent(getTranslation('ja', 'conversation.reviewNote'));
    // 注記はカードの操作より前（タブの上部）
    expect(
      note.compareDocumentPosition(within(panel).getByTestId('conv-mode-visitor')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('表示言語の切り替えに会話カードが追従する（ko）', async () => {
    localStorage.setItem('disaster-app-lang', 'ja');
    await renderHome();
    fireEvent.click(document.getElementById('tab-conversation') as HTMLElement);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'ko' } });
    const panel = document.getElementById('tabpanel-conversation') as HTMLElement;
    await waitFor(() =>
      expect(within(panel).getByTestId('conv-review-note')).toHaveTextContent(
        getTranslation('ko', 'conversation.reviewNote')
      )
    );
    expect(within(panel).getByTestId('conv-categories')).toHaveTextContent('긴급');
  });

  it('タブ名は表示言語で出る（th）', async () => {
    localStorage.setItem('disaster-app-lang', 'th');
    await renderHome();
    const tab = document.getElementById('tab-conversation') as HTMLElement;
    expect(tab.textContent).toBe(getTranslation('th', 'conversation'));
    expect(tab.textContent).not.toBe(getTranslation('en', 'conversation'));
    expect(tab.querySelector('[lang]')).toHaveAttribute('lang', 'th-TH');
  });

  it('矢印キーで 5 つのタブを巡回する（End で会話、→ で先頭に戻る）', async () => {
    await renderHome();
    const first = document.getElementById('tab-earthquake') as HTMLElement;
    fireEvent.keyDown(first, { key: 'End' });
    expect(document.getElementById('tab-conversation')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document.getElementById('tab-conversation') as HTMLElement, { key: 'ArrowRight' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(document.getElementById('tab-conversation')).toHaveAttribute('aria-selected', 'true');
  });

  it('低電力モードで会話タブを開いても読み上げは始まらない（押したときだけ）', async () => {
    localStorage.setItem(LOW_POWER_STORAGE_KEY, '1');
    const speak = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      value: { getVoices: () => [], speak, cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
      configurable: true,
      writable: true,
    });
    try {
      await renderHome();
      fireEvent.click(document.getElementById('tab-conversation') as HTMLElement);
      await act(async () => {});
      expect(document.querySelector('main')).toHaveClass('low-power');
      expect(document.getElementById('tabpanel-conversation')).not.toBeNull();
      expect(speak).not.toHaveBeenCalled();
    } finally {
      delete (window as unknown as Record<string, unknown>).speechSynthesis;
    }
  });
});
