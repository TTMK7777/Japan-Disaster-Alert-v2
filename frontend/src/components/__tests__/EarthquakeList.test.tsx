import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EarthquakeList from '../EarthquakeList';
import type { Earthquake } from '@/types/earthquake';

// テスト用の地震データ
const mockEarthquakes: Earthquake[] = [
  {
    id: '1',
    time: '2026-03-09 10:00',
    location: '東京都23区',
    magnitude: 4.5,
    max_intensity: '4',
    depth: 30,
    latitude: 35.6762,
    longitude: 139.6503,
    tsunami_warning: 'なし',
    message: '震度4の地震が発生しました',
  },
  {
    id: '2',
    time: '2026-03-09 09:00',
    location: '宮城県沖',
    location_translated: 'Off Miyagi Coast',
    magnitude: 6.2,
    max_intensity: '5弱',
    depth: 50,
    latitude: 38.3,
    longitude: 142.4,
    tsunami_warning: '津波注意報',
    tsunami_warning_translated: 'Tsunami Advisory',
    message: '大きな地震が発生しました',
    message_translated: 'A large earthquake occurred',
  },
];

describe('EarthquakeList', () => {
  // ローディングスピナーの表示テスト
  it('ローディング中にスピナーを表示する', () => {
    render(
      <EarthquakeList
        language="ja"
        earthquakes={[]}
        loading={true}
        error={null}
      />
    );

    // animate-spin クラスを持つ要素が存在すること
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  // エラー表示テスト
  it('エラーメッセージとリトライボタンを表示する', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <EarthquakeList
        language="ja"
        earthquakes={[]}
        loading={false}
        error={{ message: 'ネットワークエラー', retryable: true }}
        onRetry={onRetry}
      />
    );

    // エラーメッセージが表示されること
    expect(screen.getByText('ネットワークエラー')).toBeInTheDocument();

    // リトライボタンが表示されること
    const retryButton = screen.getByText('再試行');
    expect(retryButton).toBeInTheDocument();

    // リトライボタンをクリック
    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // retryable: false の場合、リトライボタンは非表示
  it('retryable: false の場合、リトライボタンを表示しない', () => {
    render(
      <EarthquakeList
        language="ja"
        earthquakes={[]}
        loading={false}
        error={{ message: 'サーバーエラー', retryable: false }}
        onRetry={() => {}}
      />
    );

    expect(screen.getByText('サーバーエラー')).toBeInTheDocument();
    expect(screen.queryByText('再試行')).not.toBeInTheDocument();
  });

  // 空メッセージの表示テスト
  it('地震データが空の場合にメッセージを表示する（日本語）', () => {
    render(
      <EarthquakeList
        language="ja"
        earthquakes={[]}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText('地震情報はありません')).toBeInTheDocument();
  });

  it('地震データが空の場合にメッセージを表示する（英語）', () => {
    render(
      <EarthquakeList
        language="en"
        earthquakes={[]}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText('No earthquake data')).toBeInTheDocument();
  });

  // 地震リスト表示テスト
  it('地震データをリスト表示する', () => {
    render(
      <EarthquakeList
        language="ja"
        earthquakes={mockEarthquakes}
        loading={false}
        error={null}
      />
    );

    // 場所が表示されること
    expect(screen.getByText('東京都23区')).toBeInTheDocument();
    // 翻訳がある場合は翻訳版を表示
    expect(screen.getByText('Off Miyagi Coast')).toBeInTheDocument();

    // マグニチュードが表示されること
    expect(screen.getAllByText('M4.5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('M6.2').length).toBeGreaterThan(0);

    // 震度が表示されること（複数マッチするのでgetAllByTextを使用）
    const intensityElements = screen.getAllByText(/震度/);
    expect(intensityElements.length).toBeGreaterThan(0);
  });

  // 震度クラスマッピングのテスト
  it('震度に対応するCSSクラスが適用される', () => {
    render(
      <EarthquakeList
        language="ja"
        earthquakes={mockEarthquakes}
        loading={false}
        error={null}
      />
    );

    // intensity-4 クラスが存在すること
    const intensity4 = document.querySelector('.intensity-4');
    expect(intensity4).toBeInTheDocument();

    // intensity-5-lower クラスが存在すること（5弱）
    const intensity5Lower = document.querySelector('.intensity-5-lower');
    expect(intensity5Lower).toBeInTheDocument();
  });

  // 津波リスク検出のテスト
  it('津波リスクがある場合に赤色背景を表示する', () => {
    render(
      <EarthquakeList
        language="ja"
        earthquakes={mockEarthquakes}
        loading={false}
        error={null}
      />
    );

    // 津波リスクあり（宮城県沖）: bg-red-50
    const redBg = document.querySelector('.bg-red-50');
    expect(redBg).toBeInTheDocument();

    // 津波リスクなし（東京都23区）: bg-green-50
    const greenBg = document.querySelector('.bg-green-50');
    expect(greenBg).toBeInTheDocument();
  });

  it('津波警報「なし」の場合は緑色のテキストを表示する', () => {
    render(
      <EarthquakeList
        language="ja"
        earthquakes={[mockEarthquakes[0]]}
        loading={false}
        error={null}
      />
    );

    // 「なし」テキストが緑色で表示
    const greenText = document.querySelector('.text-green-600');
    expect(greenText).toBeInTheDocument();
    expect(greenText?.textContent).toBe('なし');
  });
});
