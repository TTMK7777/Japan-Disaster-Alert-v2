import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import VolcanoWarnings from '../VolcanoWarnings';

/**
 * 噴火警報の表示。
 *
 * この機能は「配線されていない 455 行」として長く残っていた。
 * 取得先の URL が存在せず 404 を握りつぶす作りだったため、
 * **一度も警報を表示できたことがなかった**。ここでは
 * 「描画されること」と「無いときに黙らないこと」を固定する。
 */

const LEVEL3 = {
  volcano_code: '503',
  volcano_name: 'Asosan',
  volcano_name_en: 'Asosan',
  alert_level: 3,
  level_label: 'Alert Level 3',
  alert_level_name: 'Climbing restricted',
  action: 'Climbing is prohibited and access is restricted.',
  severity: 'high',
  condition: '引上げ',
  is_continuing: false,
  issued_at: '2026-08-14T15:45:00+09:00',
  municipalities: ['Kumamoto Prefecture'],
};

const NO_LEVEL = {
  volcano_code: '329',
  volcano_name: 'Ioto',
  volcano_name_en: 'Ioto',
  alert_level: null,
  level_label: '',
  alert_level_name: 'Danger near the crater',
  action: '',
  severity: 'high',
  condition: '継続',
  is_continuing: true,
  issued_at: '2007-12-01T10:01:00+09:00',
  municipalities: ['Tokyo'],
};

const ADVISORY = {
  volcano_code: '331',
  volcano_name: 'Fukutoku-Oka-no-Ba',
  alert_level: null,
  level_label: '',
  alert_level_name: 'Caution in surrounding waters',
  action: '',
  severity: 'advisory',
  condition: '引上げ',
  is_continuing: false,
  issued_at: '2026-08-01T09:00:00+09:00',
  municipalities: [],
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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('継続中の噴火警報', () => {
  /**
   * 桜島や硫黄島のように十数年前から出続けている警報がある。
   * 発表日時だけを相対表示すると「14 年前」となり、**もう終わった情報**に見える。
   * 実際には今も出ているので、継続中はバッジで前面に出し相対時刻は出さない。
   */
  it('継続中の警報にはバッジが出て、相対時刻は出ない', async () => {
    mockFetch([NO_LEVEL]);
    render(<VolcanoWarnings language="ja" />);

    const item = await screen.findByRole('listitem');
    expect(within(item).getByText('継続中')).toBeInTheDocument();
    // "(17 年前)" のような相対時刻が付いていないこと（時刻表記は括弧の外）
    expect(/\((?!.*\d{1,2}:\d{2}).*\)/.test(item.textContent ?? '')).toBe(false);
  });

  it('継続中でない警報にはバッジが出ず、相対時刻は残る', async () => {
    mockFetch([LEVEL3]);
    render(<VolcanoWarnings language="ja" />);

    const item = await screen.findByRole('listitem');
    expect(within(item).queryByText('継続中')).not.toBeInTheDocument();
    expect(/\((?!.*\d{1,2}:\d{2}).*\)/.test(item.textContent ?? '')).toBe(true);
  });
});

describe('VolcanoWarnings', () => {
  it('発表中の警報を描画する', async () => {
    mockFetch([LEVEL3, NO_LEVEL, ADVISORY]);
    render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(screen.getByText('Asosan')).toBeTruthy());
    expect(screen.getByText('Ioto')).toBeTruthy();
    expect(screen.getByText('Fukutoku-Oka-no-Ba')).toBeTruthy();
  });

  it('警報が無いときは何も置かない', async () => {
    mockFetch([]);
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    expect(container.textContent?.trim()).toBe('');
  });

  it('取得に失敗したときは黙らない', async () => {
    // 何も描画しないと「警報が無い＝安全」と読まれる。これが一番まずい
    mockFetch(null, false);
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(container.textContent).toContain('Volcanic Warnings'));
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it('レベルのバッジはレベル制の火山にだけ出す', async () => {
    mockFetch([LEVEL3, NO_LEVEL]);
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(screen.getByText('Asosan')).toBeTruthy());
    // 「継続中」は階級ではないので、レベルのバッジだけを数える
    const badges = [...container.querySelectorAll('[data-badge="level"]')].map((b) => b.textContent);
    expect(badges).toContain('Alert Level 3');
    // 空のバッジ枠を描かない
    expect(badges.every((b) => b && b.trim().length > 0)).toBe(true);
    expect(badges).toHaveLength(1);
  });

  it('防災対応があればそれを、無ければ警報種別を本文にする', async () => {
    mockFetch([LEVEL3, NO_LEVEL]);
    render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(screen.getByText('Asosan')).toBeTruthy());
    expect(screen.getByText(LEVEL3.action)).toBeTruthy();
    // レベル制でない火山は警報種別そのものが内容
    expect(screen.getByText(NO_LEVEL.alert_level_name)).toBeTruthy();
  });

  it('警報以上だけが読み上げに割り込む', async () => {
    mockFetch([LEVEL3, ADVISORY]);
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(screen.getByText('Asosan')).toBeTruthy());
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('Asosan');
  });

  it('継続中は発表時刻ではなく最終更新として出す', async () => {
    // 気象庁は変化がない限り発表日時を更新しない。2007 年の日時を
    // 「発表時刻」と書くと、たった今出た警報に見える
    mockFetch([NO_LEVEL]);
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(screen.getByText('Ioto')).toBeTruthy());
    expect(container.textContent).toContain('Last update');
    expect(container.textContent).not.toContain('Issued at');
  });

  it('継続中でなければ発表時刻として出す', async () => {
    mockFetch([LEVEL3]);
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(screen.getByText('Asosan')).toBeTruthy());
    expect(container.textContent).toContain('Issued at');
  });

  it('対象地域を出す。空なら行ごと出さない', async () => {
    mockFetch([LEVEL3, ADVISORY]);
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(screen.getByText('Asosan')).toBeTruthy());
    expect(container.textContent).toContain('Kumamoto Prefecture');
    const areaLines = [...container.querySelectorAll('p')].filter((p) =>
      p.textContent?.startsWith('Affected areas:')
    );
    expect(areaLines).toHaveLength(1);
  });

  it('気象庁の出典へのリンクを常に置く', async () => {
    mockFetch([LEVEL3]);
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(screen.getByText('Asosan')).toBeTruthy());
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toContain('jma.go.jp');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('言語をAPIに渡す', async () => {
    const fn = mockFetch([LEVEL3]);
    render(<VolcanoWarnings language="fr" />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(String(fn.mock.calls[0][0])).toContain('lang=fr');
  });

  it('見出しが選択中の言語で出る', async () => {
    mockFetch([LEVEL3]);
    const { container } = render(<VolcanoWarnings language="ja" />);
    await waitFor(() => expect(screen.getByText('Asosan')).toBeTruthy());
    expect(container.querySelector('h3')?.textContent).toContain('噴火警報');
  });

  it('配列以外が返っても壊れない', async () => {
    mockFetch({ detail: 'nope' });
    const { container } = render(<VolcanoWarnings language="en" />);
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });
});
