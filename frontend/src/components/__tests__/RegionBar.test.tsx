import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RegionBar, { GEOLOCATION_OPTIONS } from '../RegionBar';
import SpecialWarningBand from '../SpecialWarningBand';
import { getTranslation } from '@/i18n/translations';
import { resetPrefGridCache, PREF_GRID_URL } from '@/lib/prefGrid';
import { readFileSync } from 'fs';
import { join } from 'path';

const GRID_JSON = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'pref-grid.json'), 'utf-8'));

/**
 * 地域の明示（B8）。黙って東京を出さない・現在地は端末内だけで推定し利用者が確定する。
 */

type Success = (pos: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (err: { code: number }) => void;

let geoCalls: { success: Success; failure: Failure; options: PositionOptions }[];
const fetchSpy = vi.fn();

function installGeolocation() {
  geoCalls = [];
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: Success, failure: Failure, options: PositionOptions) => {
        geoCalls.push({ success, failure, options });
      },
    },
  });
}

beforeEach(() => {
  installGeolocation();
  resetPrefGridCache();
  fetchSpy.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetPrefGridCache();
  // jsdom の既定（geolocation なし）に戻す
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});

const tr = (lang: string, key: string) => getTranslation(lang, key);

describe('RegionBar — 未選択', () => {
  it('地域が無ければ「地域を選んでください」を出し、どこの情報も「表示中」としない', () => {
    render(<RegionBar language="ja" prefCode={null} prefResolved onSelect={() => {}} />);
    expect(screen.getByRole('heading', { name: tr('ja', 'region.choose') })).toBeInTheDocument();
    expect(screen.queryByTestId('region-bar')).toBeNull();
    expect(document.body.textContent).not.toContain('東京都の情報を表示中');
    const select = document.getElementById('region-select') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('決定前（prefResolved=false）は何も出さない（選んでくださいを一瞬出さない）', () => {
    const { container } = render(<RegionBar language="ja" prefCode={null} prefResolved={false} onSelect={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('一覧から選ぶと onSelect にそのコードを渡す', () => {
    const onSelect = vi.fn();
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={onSelect} />);
    fireEvent.change(document.getElementById('region-select') as HTMLSelectElement, { target: { value: '260000' } });
    expect(onSelect).toHaveBeenCalledWith('260000');
  });
});

describe('RegionBar — 現在地から選ぶ', () => {
  it('推定した県を候補として出し、「この地域にする」で確定する（押すまでは選ばない）', () => {
    const onSelect = vi.fn();
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={onSelect} />);
    fireEvent.click(document.getElementById('region-locate') as HTMLElement);
    expect(geoCalls).toHaveLength(1);
    expect(geoCalls[0].options).toEqual(GEOLOCATION_OPTIONS);
    // 石垣島 → 沖縄県
    fireEvent.click(document.body); // 何もしない操作を挟んでも勝手に確定しない
    geoCalls[0].success({ coords: { latitude: 24.34, longitude: 124.156 } });
    return Promise.resolve().then(async () => {
      const candidate = await screen.findByTestId('region-candidate');
      expect(candidate).toHaveTextContent(tr('en', 'region.confirm'));
      expect(candidate).toHaveTextContent('Okinawa');
      expect(onSelect).not.toHaveBeenCalled();
      fireEvent.click(document.getElementById('region-confirm-yes') as HTMLElement);
      expect(onSelect).toHaveBeenCalledWith('471000');
    });
  });

  it('座標を外へ送らない（取りに行くのは同じオリジンの格子表だけで、座標はどこにも載らない）', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => GRID_JSON });
    const onSelect = vi.fn();
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={onSelect} />);
    fireEvent.click(document.getElementById('region-locate') as HTMLElement);
    // 愛知・豊橋の避難所（代表点の最近傍では静岡になっていた点）
    geoCalls[0].success({ coords: { latitude: 34.74998, longitude: 137.396422 } });
    expect(await screen.findByTestId('region-candidate')).toHaveTextContent('Aichi');
    fireEvent.click(screen.getByText(tr('en', 'region.confirmYes')));
    expect(onSelect).toHaveBeenCalledWith('230000');
    expect(fetchSpy.mock.calls).toEqual([[PREF_GRID_URL]]);
    const sent = JSON.stringify(fetchSpy.mock.calls);
    expect(sent).not.toContain('34.7');
    expect(sent).not.toContain('137.3');
  });

  it('格子表が取れなければ代表点で推定する（候補は出る）', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={() => {}} />);
    fireEvent.click(document.getElementById('region-locate') as HTMLElement);
    geoCalls[0].success({ coords: { latitude: 24.34, longitude: 124.156 } });
    expect(await screen.findByTestId('region-candidate')).toHaveTextContent('Okinawa');
  });

  it('「一覧から選ぶ」で候補を捨て、選ばない', async () => {
    const onSelect = vi.fn();
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={onSelect} />);
    fireEvent.click(document.getElementById('region-locate') as HTMLElement);
    geoCalls[0].success({ coords: { latitude: 35.681, longitude: 139.767 } });
    fireEvent.click(await screen.findByText(tr('en', 'region.confirmNo')));
    expect(screen.queryByTestId('region-candidate')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ['拒否（PERMISSION_DENIED）', 1],
    ['取得できない（POSITION_UNAVAILABLE）', 2],
    ['タイムアウト（TIMEOUT）', 3],
  ])('%s なら理由を出して手動選択に戻る', async (_label, code) => {
    const onSelect = vi.fn();
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={onSelect} />);
    fireEvent.click(document.getElementById('region-locate') as HTMLElement);
    geoCalls[0].failure({ code });
    expect(await screen.findByTestId('region-geo-error')).toHaveTextContent(tr('en', 'region.locationFailed'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.getElementById('region-select')).not.toBeNull();
    expect((document.getElementById('region-locate') as HTMLButtonElement).disabled).toBe(false);
  });

  it('非対応ブラウザ（navigator.geolocation が無い）でも落ちず、手動選択に戻る', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={() => {}} />);
    fireEvent.click(document.getElementById('region-locate') as HTMLElement);
    expect(await screen.findByTestId('region-geo-error')).toHaveTextContent(tr('en', 'region.locationFailed'));
  });

  it('国外の座標なら候補を出さず「判定できない」と出す', async () => {
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={() => {}} />);
    fireEvent.click(document.getElementById('region-locate') as HTMLElement);
    geoCalls[0].success({ coords: { latitude: 37.566, longitude: 126.978 } }); // ソウル
    expect(await screen.findByTestId('region-geo-error')).toHaveTextContent(tr('en', 'region.locationUnknown'));
    expect(screen.queryByTestId('region-candidate')).toBeNull();
  });

  it('位置の取得中に一覧で選んだら、遅れて返った位置は無視する', async () => {
    const onSelect = vi.fn();
    render(<RegionBar language="en" prefCode={null} prefResolved onSelect={onSelect} />);
    fireEvent.click(document.getElementById('region-locate') as HTMLElement);
    fireEvent.change(document.getElementById('region-select') as HTMLSelectElement, { target: { value: '270000' } });
    geoCalls[0].success({ coords: { latitude: 35.681, longitude: 139.767 } });
    await Promise.resolve();
    expect(screen.queryByTestId('region-candidate')).toBeNull();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('270000');
  });
});

describe('RegionBar — 選択済み', () => {
  it('「{pref}の情報を表示中」を表示言語の地域名で出す（日本語県名を連結しない）', () => {
    const { rerender } = render(<RegionBar language="ja" prefCode="130000" prefResolved onSelect={() => {}} />);
    expect(screen.getByTestId('region-bar')).toHaveTextContent('東京都の情報を表示中');
    rerender(<RegionBar language="en" prefCode="130000" prefResolved onSelect={() => {}} />);
    expect(screen.getByTestId('region-bar')).toHaveTextContent('Showing information for Tokyo');
    expect(screen.getByTestId('region-bar').textContent).not.toContain('東京都');
    rerender(<RegionBar language="th" prefCode="471000" prefResolved onSelect={() => {}} />);
    expect(screen.getByTestId('region-bar')).toHaveTextContent(
      tr('th', 'region.showing').replace('{pref}', 'Okinawa')
    );
  });

  it('「地域を変更」で選択 UI を開き、選び直すと閉じる', () => {
    const onSelect = vi.fn();
    render(<RegionBar language="en" prefCode="130000" prefResolved onSelect={onSelect} />);
    fireEvent.click(document.getElementById('region-change') as HTMLElement);
    const select = document.getElementById('region-select') as HTMLSelectElement;
    expect(select.value).toBe('130000');
    fireEvent.change(select, { target: { value: '016000' } });
    expect(onSelect).toHaveBeenCalledWith('016000');
    expect(screen.getByTestId('region-bar')).toBeInTheDocument();
  });

  it('選択 UI は「閉じる」で選ばずに戻れる', () => {
    const onSelect = vi.fn();
    render(<RegionBar language="en" prefCode="130000" prefResolved onSelect={onSelect} />);
    fireEvent.click(document.getElementById('region-change') as HTMLElement);
    fireEvent.click(document.getElementById('region-close') as HTMLElement);
    expect(screen.getByTestId('region-bar')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('SpecialWarningBand', () => {
  it('「{pref}に特別警報が出ています」を表示言語の地域名で出し、「警報を見る」で onView', () => {
    const onView = vi.fn();
    const { rerender } = render(<SpecialWarningBand language="ja" prefCode="130000" onView={onView} />);
    const band = screen.getByTestId('special-warning-band');
    expect(band).toHaveAttribute('role', 'alert');
    expect(band).toHaveTextContent('東京都に特別警報が出ています');
    fireEvent.click(screen.getByRole('button', { name: tr('ja', 'warning.view') }));
    expect(onView).toHaveBeenCalledTimes(1);
    rerender(<SpecialWarningBand language="en" prefCode="471000" onView={onView} />);
    expect(screen.getByTestId('special-warning-band')).toHaveTextContent(
      'An Emergency Warning is in effect for Okinawa'
    );
  });

  it('表に無いコードでは出さない（"undefined" に特別警報と出さない）', () => {
    const { container } = render(<SpecialWarningBand language="en" prefCode="460000" onView={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
