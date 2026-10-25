import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import WarningBanner, { WARNING_FETCH_TIMEOUT_MS } from '../WarningBanner';
import { getTranslation } from '@/i18n/translations';
import { PREFECTURE_DISASTER_LINKS } from '@/lib/prefectureDisasterLinks';

/**
 * 気象庁の警報表示。
 *
 * ## なぜ「継続中」を前面に出すか
 *
 * 気象庁は**内容が変わらない限り `reportDatetime` を更新しない**。伊豆諸島の
 * 注意報は実データで 3 か月前の日時を持ったまま status="継続" で出続けている。
 * これを「最終更新: 5/28 (3 か月前)」と出すと、日本語を読めない利用者には
 * **情報が古い＝このアプリは壊れている**と読まれる。実際には「今も出ている」。
 * 相対時刻は継続中の警報からは外し、代わりに「継続中」バッジを階級バッジの隣に置く。
 */

const CONTINUING = {
  id: 'w-continuing',
  type: 'thunder',
  title: '雷注意報',
  title_translated: 'Thunder Advisory',
  description: '伊豆諸島北部に雷注意報が継続しています。',
  description_translated: 'Thunder Advisory remains in effect for Northern Izu Islands.',
  area: '伊豆諸島北部',
  issued_at: '2026-05-28T10:16:00+09:00',
  is_continuing: true,
  severity: 'low',
};

const NEW_WARNING = {
  id: 'w-new',
  type: 'heavy_rain',
  title: '大雨警報',
  title_translated: 'Heavy Rain Warning',
  description: '東京地方に大雨警報が発表されました。',
  description_translated: 'Heavy Rain Warning issued for the Tokyo area.',
  area: '東京地方',
  issued_at: '2026-05-28T10:16:00+09:00',
  is_continuing: false,
  severity: 'high',
};

function mockFetch(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** 相対時刻（"3 か月前" / "3 months ago"）が出ているか。丸括弧つきで描画される。 */
function hasRelativeTime(container: HTMLElement): boolean {
  return /\((?!.*\d{1,2}:\d{2}).*\)/.test(container.textContent ?? '');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // 発表から 3 か月後。相対時刻が出るなら "3 か月前" になる位置。
  vi.setSystemTime(new Date('2026-08-25T21:00:00+09:00'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WarningBanner — 継続中の警報', () => {
  it('継続中の警報には「継続中」バッジが出る', async () => {
    mockFetch([CONTINUING]);
    render(<WarningBanner areaCode="130000" language="ja" />);

    const item = await screen.findByRole('listitem');
    expect(within(item).getByText('継続中')).toBeInTheDocument();
  });

  it('継続中の警報では相対時刻を出さない（「3 か月前」が古さと読まれるため）', async () => {
    mockFetch([CONTINUING]);
    const { container } = render(<WarningBanner areaCode="130000" language="ja" />);
    await screen.findByRole('listitem');

    expect(container.textContent).toContain('継続中');
    // 日時そのものは残す（いつからの情報かは必要）
    expect(container.textContent).toContain('2026');
    expect(hasRelativeTime(container)).toBe(false);
  });

  it('新規発表の警報では従来どおり相対時刻を出す（鮮度として意味がある）', async () => {
    mockFetch([NEW_WARNING]);
    const { container } = render(<WarningBanner areaCode="130000" language="ja" />);
    await screen.findByRole('listitem');

    expect(container.textContent).not.toContain('継続中');
    expect(hasRelativeTime(container)).toBe(true);
  });

  it('バッジは表示言語で訳される（英語 / やさしい日本語）', async () => {
    for (const lang of ['en', 'easy_ja'] as const) {
      mockFetch([CONTINUING]);
      const { unmount } = render(<WarningBanner areaCode="130000" language={lang} />);
      const item = await screen.findByRole('listitem');
      expect(
        within(item).getByText(getTranslation(lang, 'warning.continuing'))
      ).toBeInTheDocument();
      unmount();
    }
  });

  it('「継続中」は階級バッジとは別の要素として並ぶ（階級の符号を上書きしない）', async () => {
    mockFetch([CONTINUING]);
    render(<WarningBanner areaCode="130000" language="ja" />);
    const item = await screen.findByRole('listitem');

    // 注意報（階級）と継続中（状態）は別々のバッジ
    expect(within(item).getByText('注意報')).toBeInTheDocument();
    expect(within(item).getByText('継続中')).toBeInTheDocument();
    expect(within(item).getByText('注意報')).not.toBe(within(item).getByText('継続中'));
  });
});

describe('WarningBanner — 地域の受け渡し（URL の ?pref= 用）', () => {
  it('利用者がセレクタで地域を変えたら onAreaCodeChange に新しいコードを渡す', async () => {
    mockFetch([]);
    const onAreaCodeChange = vi.fn();
    render(<WarningBanner areaCode="130000" language="ja" onAreaCodeChange={onAreaCodeChange} />);
    const select = await screen.findByRole('combobox');

    fireEvent.change(select, { target: { value: '260000' } });

    expect(onAreaCodeChange).toHaveBeenCalledWith('260000');
    expect(select).toHaveValue('260000');
  });

  it('親から渡す areaCode が後から変わったら、その地域に切り替えて取得し直す', async () => {
    const fetchMock = mockFetch([]);
    const { rerender } = render(<WarningBanner areaCode="130000" language="ja" />);
    await screen.findByRole('combobox');

    rerender(<WarningBanner areaCode="260000" language="ja" />);

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('260000'));
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('area_code=260000'))).toBe(true);
  });

  it('areaCode を変えない親のもとでは、利用者の選択を保つ（従来の非制御の挙動）', async () => {
    mockFetch([]);
    const { rerender } = render(<WarningBanner areaCode="130000" language="ja" />);
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: '270000' } });
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('270000'));

    rerender(<WarningBanner areaCode="130000" language="en" />);

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('270000'));
  });
});

describe('WarningBanner — 選んだ県の公式防災ページへのボタン', () => {
  // このアプリは避難指示・避難所の開設状況を扱わない。警報タブでは県が決まっているので、
  // 「警報なし」を「避難指示なし」と読ませないよう、その県の公式ページへ 1 タップで行けるようにする
  const okinawa = PREFECTURE_DISASTER_LINKS.find((l) => l.pref === '47')!;
  const osaka = PREFECTURE_DISASTER_LINKS.find((l) => l.pref === '27')!;

  async function findOfficialLink() {
    return screen.findByRole('link', { name: new RegExp(escapeRegExp(getTranslation('th', 'scope.prefectureLink'))) });
  }

  it('警報なしの画面に、県の外国語ページへのボタンが出る（タイ語）', async () => {
    mockFetch([]);
    render(<WarningBanner areaCode="471000" language="th" />);
    const link = await findOfficialLink();
    expect(link).toHaveAttribute('href', okinawa.foreignUrl!);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('警報が出ている画面にも出る', async () => {
    mockFetch([NEW_WARNING]);
    render(<WarningBanner areaCode="471000" language="th" />);
    await screen.findByRole('listitem');
    expect(await findOfficialLink()).toHaveAttribute('href', okinawa.foreignUrl!);
  });

  it('警報の取得に失敗した画面にも出る（いちばん公式情報が要る場面）', async () => {
    mockFetch({}, false);
    render(<WarningBanner areaCode="471000" language="th" />);
    await screen.findByText(getTranslation('th', 'status.fetchFailed'));
    expect(await findOfficialLink()).toHaveAttribute('href', okinawa.foreignUrl!);
  });

  it('セレクタで県を変えるとボタンの行き先も変わる', async () => {
    mockFetch([]);
    render(<WarningBanner areaCode="471000" language="th" />);
    await findOfficialLink();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '270000' } });
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: new RegExp(escapeRegExp(getTranslation('th', 'scope.prefectureLink'))) })
      ).toHaveAttribute('href', osaka.foreignUrl ?? osaka.disasterUrl)
    );
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('WarningBanner — 地域未指定（B8: 黙って東京を出さない）', () => {
  it('areaCode が無ければ取りに行かず「地域を選んでください」を出す', async () => {
    const fetchFn = mockFetch([NEW_WARNING]);
    render(<WarningBanner language="ja" />);
    expect(await screen.findByTestId('warning-choose-region')).toHaveTextContent(getTranslation('ja', 'region.choose'));
    expect(fetchFn).not.toHaveBeenCalled();
    // 見出しに地域名が出ない（セレクタの選択肢には東京都もあるので、見出しで見る）
    expect(screen.queryByRole('heading', { name: /東京/ })).toBeNull();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('null を渡しても同じ（未選択）', async () => {
    const fetchFn = mockFetch([]);
    render(<WarningBanner language="en" areaCode={null} />);
    expect(await screen.findByTestId('warning-choose-region')).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('未選択の画面で選ぶと、その地域で取りに行き onAreaCodeChange と onWarningsUpdate にコードを渡す', async () => {
    const fetchFn = mockFetch([NEW_WARNING]);
    const onAreaCodeChange = vi.fn();
    const onWarningsUpdate = vi.fn();
    render(<WarningBanner language="ja" onAreaCodeChange={onAreaCodeChange} onWarningsUpdate={onWarningsUpdate} />);
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '260000' } });
    expect(onAreaCodeChange).toHaveBeenCalledWith('260000');
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(String(fetchFn.mock.calls[0][0])).toContain('area_code=260000');
    await waitFor(() => expect(onWarningsUpdate).toHaveBeenCalledWith([NEW_WARNING], '260000', { partial: false }));
  });
});


describe('上部帯への失敗通知', () => {
  async function flush() { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); }
  it.each(['http', 'cache', 'payload', 'json', 'timeout'])('%s の失敗と成功・部分欠落を通知', async (kind) => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockImplementation((_url, init) => kind === 'timeout'
      ? new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
      : Promise.resolve({ ok: kind !== 'http', status: 503,
        headers: new Headers(kind === 'cache' ? { 'X-SW-Cache': '1' } : {}),
        json: async () => { if (kind === 'json') throw new SyntaxError('invalid'); return {}; } }));
    vi.stubGlobal('fetch', fetchFn);
    const failed = vi.fn(); const updated = vi.fn();
    render(<WarningBanner areaCode="130000" onWarningsFailure={failed} onWarningsUpdate={updated} />);
    await flush();
    if (kind === 'timeout') await act(async () => { await vi.advanceTimersByTimeAsync(WARNING_FETCH_TIMEOUT_MS); });
    expect(failed).toHaveBeenCalledExactlyOnceWith('130000');
    expect(updated).not.toHaveBeenCalled();
    fetchFn.mockResolvedValue({ ok: true, headers: new Headers(), json: async () => [] });
    fireEvent.click(within(screen.getByTestId('warning-fetch-failure')).getByRole('button'));
    await flush();
    expect(updated).toHaveBeenLastCalledWith([], '130000', { partial: false });
    fetchFn.mockResolvedValue({ ok: true, headers: new Headers({ 'X-Failed-Areas': '474000' }), json: async () => [] });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    expect(updated).toHaveBeenLastCalledWith([], '130000', { partial: true });
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it('中断された旧地域の遅い HTTP 失敗を通知しない', async () => {
    vi.useFakeTimers();
    let finish!: (response: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => [] }));
    const failed = vi.fn(); const updated = vi.fn();
    const { rerender } = render(<WarningBanner areaCode="130000" onWarningsFailure={failed} onWarningsUpdate={updated} />);
    rerender(<WarningBanner areaCode="270000" onWarningsFailure={failed} onWarningsUpdate={updated} />);
    await flush();
    await act(async () => { finish({ ok: false, status: 503 }); });
    expect(failed).not.toHaveBeenCalled();
    expect(updated).toHaveBeenCalledExactlyOnceWith([], '270000', { partial: false });
  });
  it('期限超過後にアンマウントした取得の遅い失敗も通知しない', async () => {
    vi.useFakeTimers();
    let rejectFetch!: (error: Error) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_resolve, reject) => { rejectFetch = reject; })));
    const failed = vi.fn();
    const { unmount } = render(<WarningBanner areaCode="130000" onWarningsFailure={failed} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(WARNING_FETCH_TIMEOUT_MS); });
    unmount();
    await act(async () => { rejectFetch(new DOMException('Aborted', 'AbortError')); });
    expect(failed).not.toHaveBeenCalled();
  });
  it('地域変更とアンマウントの自己中断は通知しない', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const failed = vi.fn();
    const { rerender, unmount } = render(<WarningBanner areaCode="130000" onWarningsFailure={failed} />);
    rerender(<WarningBanner areaCode="270000" onWarningsFailure={failed} />);
    await flush(); unmount(); await flush();
    expect(failed).not.toHaveBeenCalled();
  });
});
