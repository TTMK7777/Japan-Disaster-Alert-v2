import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import WarningBanner from '../WarningBanner';
import { getTranslation } from '@/i18n/translations';

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
