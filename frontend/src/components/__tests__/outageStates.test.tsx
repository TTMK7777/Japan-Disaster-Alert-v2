import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import WarningBanner from '../WarningBanner';
import VolcanoWarnings from '../VolcanoWarnings';
import EarthquakeList from '../EarthquakeList';
import { getTranslation } from '@/i18n/translations';
import type { Earthquake } from '@/types/earthquake';

/**
 * B4a: 上流（気象庁・P2P・backend）が落ちた・遅いときに「警報なし」「地震情報はありません」
 * 「噴火警報なし（無表示）」に見せない。取得失敗と本当の 0 件を分け、期限超過も失敗として出す。
 * 画面切替（後続の取得による置換）で中断した分だけは表示しない。
 */

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet', () => ({ default: { divIcon: vi.fn(() => ({})) } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
  Circle: () => null,
  useMap: () => ({ flyTo: vi.fn() }),
}));

import ShelterMap from '../ShelterMap';

type Reply = { ok: boolean; status?: number; body?: unknown; headers?: Record<string, string> } | 'hang';
let route: (url: string) => Reply;
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const reply = route(String(input));
  if (reply === 'hang') {
    // 応答しない。中断されたら本物の fetch と同じく AbortError で reject する
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  }
  const headers = new Map(Object.entries(reply.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return Promise.resolve({
    ok: reply.ok,
    status: reply.status ?? (reply.ok ? 200 : 503),
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: async () => reply.body,
  });
});

const ja = (key: string) => getTranslation('ja', key);
const en = (key: string) => getTranslation('en', key);

beforeEach(() => {
  fetchMock.mockClear();
  route = () => ({ ok: true, body: [] });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------ 警報タブ

describe('WarningBanner — 取得失敗を「警報なし」にしない', () => {
  it('503 なら緑の「警報なし」を出さず、失敗・無いという意味ではない・再試行・公式導線を出す', async () => {
    route = () => ({ ok: false, status: 503 });
    const { container } = render(<WarningBanner areaCode="130000" language="ja" />);
    const notice = await screen.findByTestId('warning-fetch-failure');
    expect(notice.textContent).toContain(ja('status.fetchFailed'));
    expect(notice.textContent).toContain(ja('status.notMeaningNone'));
    expect(notice.textContent).toContain(ja('status.checkOfficial'));
    expect(notice.querySelector('a[data-link-kind]')).toBeTruthy();
    expect(screen.getByRole('button', { name: ja('status.retry') })).toBeTruthy();
    expect(container.textContent).not.toContain(ja('warning.noWarnings'));
    expect(container.textContent).not.toContain('✅');
    // 初回で一度も取れていないので「最後に取得できた時刻」は出さない
    expect(screen.queryByTestId('warning-fetch-failure-last-success')).toBeNull();
  });

  it('10 秒の期限超過は「時間内に応答がない」失敗として出す（黙って緑にしない）', async () => {
    vi.useFakeTimers();
    route = () => 'hang';
    const { container } = render(<WarningBanner areaCode="130000" language="en" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    const notice = screen.getByTestId('warning-fetch-failure');
    expect(notice.getAttribute('data-reason')).toBe('timeout');
    expect(notice.textContent).toContain(en('status.timedOut'));
    expect(container.textContent).not.toContain(en('warning.noWarnings'));
  });

  it('地域の切替で前の取得を中断した分は失敗として出さない', async () => {
    route = (url) => (url.includes('area_code=130000') ? 'hang' : { ok: true, body: [] });
    const { rerender } = render(<WarningBanner areaCode="130000" language="ja" />);
    rerender(<WarningBanner areaCode="270000" language="ja" />);
    await screen.findByText(ja('warning.noWarnings'));
    expect(screen.queryByTestId('warning-fetch-failure')).toBeNull();
  });

  it('一部の予報区が取れなければ、取れた分が 0 件でも「警報なし」にせず欠けた地域を示す', async () => {
    route = () => ({ ok: true, body: [], headers: { 'X-Failed-Area-Names': 'Yaeyama,Miyakojima%20Region' } });
    const { container } = render(<WarningBanner areaCode="471000" language="en" />);
    const notice = await screen.findByTestId('warning-fetch-failure');
    expect(notice.getAttribute('data-reason')).toBe('partial');
    expect(notice.textContent).toContain('Yaeyama, Miyakojima Region');
    expect(notice.textContent).toContain(en('status.notMeaningNone'));
    expect(container.textContent).not.toContain(en('warning.noWarnings'));
  });

  it('取れた分の警報は欠落の表示と一緒に出す', async () => {
    const alert = { id: 'a', type: 'x', title: '大雨警報', title_translated: 'Heavy Rain Warning', description: 'd', area: 'a', issued_at: '2026-10-22T10:00:00+09:00', severity: 'high' };
    route = () => ({ ok: true, body: [alert], headers: { 'X-Failed-Area-Names': 'Yaeyama' } });
    render(<WarningBanner areaCode="471000" language="en" />);
    await screen.findByText('Heavy Rain Warning');
    expect(screen.getByTestId('warning-fetch-failure').textContent).toContain('Yaeyama');
  });

  it('成功のあとに失敗したら最後に取れた時刻と前回の警報を出し、再試行の成功でだけ解除する', async () => {
    const alert = { id: 'a', type: 'x', title: '大雨警報', description: 'd', area: 'a', issued_at: '2026-10-22T10:00:00+09:00', severity: 'high' };
    route = () => ({ ok: true, body: [alert] });
    const onUpdate = vi.fn();
    const { rerender } = render(<WarningBanner areaCode="130000" language="ja" onWarningsUpdate={onUpdate} />);
    await screen.findByText('大雨警報');
    expect(onUpdate).toHaveBeenCalledTimes(1);

    route = () => ({ ok: false, status: 503 });
    rerender(<WarningBanner areaCode="130000" language="easy_ja" onWarningsUpdate={onUpdate} />);
    await screen.findByTestId('warning-fetch-failure');
    expect(screen.getByTestId('warning-fetch-failure-last-success')).toBeTruthy();
    expect(screen.getByText('大雨警報')).toBeTruthy();
    // 失敗は特別警報の帯へ「なし」として渡さない
    expect(onUpdate).toHaveBeenCalledTimes(1);

    route = () => ({ ok: true, body: [] });
    fireEvent.click(screen.getByRole('button', { name: getTranslation('easy_ja', 'status.retry') }));
    await screen.findByText(getTranslation('easy_ja', 'warning.noWarnings'));
    expect(screen.queryByTestId('warning-fetch-failure')).toBeNull();
  });

  it('一部欠落は帯へ partial として伝える（欠けた予報区の特別警報を「なし」と読ませない）', async () => {
    route = () => ({ ok: true, body: [], headers: { 'X-Failed-Areas': '474000' } });
    const onUpdate = vi.fn();
    render(<WarningBanner areaCode="471000" language="en" onWarningsUpdate={onUpdate} />);
    await screen.findByTestId('warning-fetch-failure');
    expect(onUpdate).toHaveBeenCalledWith([], '471000', { partial: true });
  });
});

// ------------------------------------------------------------------ 噴火警報

describe('VolcanoWarnings — 取得失敗を無表示にしない', () => {
  it('503 なら「取得できませんでした」の枠を出す', async () => {
    route = () => ({ ok: false, status: 503 });
    render(<VolcanoWarnings language="en" />);
    const notice = await screen.findByTestId('volcano-fetch-failure');
    expect(notice.textContent).toContain(en('status.fetchFailed'));
    expect(notice.textContent).toContain(en('status.notMeaningNone'));
    expect(notice.textContent).toContain(en('volcano.title'));
    expect(notice.querySelector('a[href*="jma.go.jp"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: en('status.retry') })).toBeTruthy();
  });

  it('期限超過も失敗として出す', async () => {
    vi.useFakeTimers();
    route = () => 'hang';
    render(<VolcanoWarnings language="en" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByTestId('volcano-fetch-failure').getAttribute('data-reason')).toBe('timeout');
  });

  it('言語切替で前の取得を中断した分は失敗として出さない', async () => {
    route = (url) => (url.includes('lang=ja') ? 'hang' : { ok: true, body: [] });
    const { rerender, container } = render(<VolcanoWarnings language="ja" />);
    rerender(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(screen.queryByTestId('volcano-fetch-failure')).toBeNull();
    expect(container.textContent?.trim()).toBe('');
  });
});

// ------------------------------------------------------------------ 地震一覧

const QUAKE: Earthquake = {
  id: 'q1', time: '2026-10-22 10:00', location: '石川県能登地方', magnitude: 4.5, max_intensity: '3',
  depth: 10, latitude: 37.5, longitude: 137.2, tsunami_warning: 'なし', message: 'm',
};

describe('EarthquakeList — 失敗で一覧を消さない', () => {
  it('失敗しても前回の一覧を残し、失敗の枠を出す', () => {
    render(
      <EarthquakeList language="ja" earthquakes={[QUAKE]} loading={false}
        error={{ message: 'x', retryable: true, reason: 'failed' }} lastSuccessAt={Date.parse('2026-10-22T10:05:00+09:00')} onRetry={() => {}} />
    );
    expect(screen.getByTestId('earthquake-fetch-failure').textContent).toContain(ja('status.notMeaningNone'));
    expect(screen.getByTestId('earthquake-fetch-failure-last-success')).toBeTruthy();
    expect(screen.getByText('石川県能登地方')).toBeTruthy();
  });

  it('初回の失敗は「地震情報はありません」にしない', () => {
    const { container } = render(
      <EarthquakeList language="en" earthquakes={[]} loading={false}
        error={{ message: 'x', retryable: true, reason: 'timeout' }} lastSuccessAt={null} onRetry={() => {}} />
    );
    expect(container.textContent).not.toContain(en('earthquake.noData'));
    expect(screen.getByTestId('earthquake-fetch-failure').getAttribute('data-reason')).toBe('timeout');
  });

  it('再取得中も手元の一覧を消さない', () => {
    render(<EarthquakeList language="ja" earthquakes={[QUAKE]} loading={true} error={null} />);
    expect(screen.getByText('石川県能登地方')).toBeTruthy();
  });
});

// ------------------------------------------------------------------ 避難所

function stubGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 35.68, longitude: 139.76 } } as GeolocationPosition),
    },
  });
}

describe('ShelterMap — 取得失敗を「見つかりませんでした」にしない', () => {
  beforeEach(stubGeolocation);

  it('503 なら「見つかりませんでした」を出さず、失敗と再試行を出す。再試行は同じ地点で取り直す', async () => {
    route = () => ({ ok: false, status: 503 });
    const { container } = render(<ShelterMap language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Get my location/i }));
    const notice = await screen.findByTestId('shelter-fetch-failure');
    expect(notice.textContent).toContain(en('status.notMeaningNone'));
    expect(container.textContent).not.toContain('No evacuation sites found in this area');

    route = () => ({ ok: true, body: { shelters: [], meta: {} } });
    fireEvent.click(screen.getByRole('button', { name: en('status.retry') }));
    await screen.findByText('No evacuation sites found in this area');
    expect(screen.queryByTestId('shelter-fetch-failure')).toBeNull();
    const shelterCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/api/v1/shelters'));
    expect(shelterCalls).toHaveLength(2);
    expect(shelterCalls[1]).toBe(shelterCalls[0]);
  });

  it('成功の 0 件には検索の半径を添える', async () => {
    route = () => ({ ok: true, body: { shelters: [], meta: {} } });
    render(<ShelterMap language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Get my location/i }));
    await screen.findByText('No evacuation sites found in this area');
    expect(screen.getByText(en('shelter.searchArea').replace('{km}', '5'))).toBeTruthy();
  });

  it('200 でも shelters が無い応答は失敗として扱う', async () => {
    route = () => ({ ok: true, body: { meta: {} } });
    const { container } = render(<ShelterMap language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Get my location/i }));
    await screen.findByTestId('shelter-fetch-failure');
    expect(container.textContent).not.toContain('No evacuation sites found in this area');
  });

  it('期限超過も失敗として出す', async () => {
    vi.useFakeTimers();
    route = () => 'hang';
    render(<ShelterMap language="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Get my location/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByTestId('shelter-fetch-failure').getAttribute('data-reason')).toBe('timeout');
  });
});

// ------------------------------------------------------------------ SW のキャッシュ応答（B4b）

describe('Service Worker のキャッシュ応答を「今取れた」にしない（B4b）', () => {
  const CACHED = { 'X-SW-Cache': '1', 'X-SW-Cached-At': '2026-10-21T00:00:00.000Z' };

  it('警報: キャッシュの [] で緑の「警報なし」を出さず失敗の枠を出す', async () => {
    route = () => ({ ok: true, body: [], headers: CACHED });
    const { container } = render(<WarningBanner areaCode="130000" language="ja" />);
    await screen.findByTestId('warning-fetch-failure');
    expect(container.textContent).not.toContain(ja('warning.noWarnings'));
  });

  it('噴火警報: キャッシュの [] は失敗の枠を出す', async () => {
    route = () => ({ ok: true, body: [], headers: CACHED });
    render(<VolcanoWarnings language="en" />);
    await screen.findByTestId('volcano-fetch-failure');
  });
});

describe('FreshnessStatus — 保存済みのデータ（B4b）', () => {
  it('SW のキャッシュしか取れなかったら「保存済みのデータ（時刻）」を出し、最後に取得は進めない', async () => {
    const { FreshnessStatus } = await import('../LowPower');
    const savedAt = Date.parse('2026-10-21T00:00:00.000Z');
    render(
      <FreshnessStatus
        language="ja"
        lastSuccessAt={null}
        lastFailed
        savedAt={savedAt}
        refreshing={false}
        onRefresh={() => {}}
        lowPower={false}
        nextPollAt={null}
        mode="sse"
        connected
      />
    );
    expect(screen.getByTestId('saved-data').textContent).toContain(ja('freshness.savedData').split('（')[0]);
    expect(screen.getByTestId('last-success').textContent).toContain(ja('freshness.never'));
  });
});
