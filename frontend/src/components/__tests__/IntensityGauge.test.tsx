import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import IntensityGauge, { IntensityBadge, IntensityScale } from '../IntensityGauge';

describe('IntensityGauge', () => {
  // 各震度レベルの表示テスト
  it('震度1を正しく表示する', () => {
    render(<IntensityGauge intensity="1" language="ja" />);

    expect(screen.getByLabelText('震度1')).toBeInTheDocument();
    expect(screen.getByText('震度1')).toBeInTheDocument();
    expect(screen.getByText('気づかない人も')).toBeInTheDocument();
  });

  it('震度4を正しく表示する', () => {
    render(<IntensityGauge intensity="4" language="ja" />);

    expect(screen.getByLabelText('震度4')).toBeInTheDocument();
    expect(screen.getByText('震度4')).toBeInTheDocument();
    expect(screen.getByText('眠っている人も目を覚ます')).toBeInTheDocument();
  });

  it('震度5弱を正しく表示する', () => {
    render(<IntensityGauge intensity="5弱" language="ja" />);

    expect(screen.getByLabelText('震度5弱')).toBeInTheDocument();
    // アイコン内で弱→-に変換される
    expect(screen.getByText('5-')).toBeInTheDocument();
    expect(screen.getByText('物につかまりたくなる')).toBeInTheDocument();
  });

  it('震度7を正しく表示する', () => {
    render(<IntensityGauge intensity="7" language="ja" />);

    expect(screen.getByLabelText('震度7')).toBeInTheDocument();
    expect(screen.getByText('投げ出される')).toBeInTheDocument();
  });

  // 英語での表示テスト
  it('英語でラベルと説明を正しく表示する', () => {
    render(<IntensityGauge intensity="6弱" language="en" />);

    expect(screen.getByText('Severe')).toBeInTheDocument();
    expect(screen.getByText("Can't stand")).toBeInTheDocument();
  });

  it('英語で震度7を表示する', () => {
    render(<IntensityGauge intensity="7" language="en" />);

    expect(screen.getByText('Violent')).toBeInTheDocument();
    expect(screen.getByText('Thrown around')).toBeInTheDocument();
  });

  // やさしい日本語テスト
  it('やさしい日本語で表示する', () => {
    render(<IntensityGauge intensity="6強" language="easy_ja" />);

    expect(screen.getByText('しんど6つよい')).toBeInTheDocument();
    expect(screen.getByText('はわないと うごけない！')).toBeInTheDocument();
  });

  // showLabel=false のテスト
  it('showLabel=false の場合、ラベルを非表示にする', () => {
    render(<IntensityGauge intensity="3" language="ja" showLabel={false} />);

    // ラベルは非表示だが、説明テキストとアイコンは表示される
    expect(screen.queryByText('震度3')).not.toBeInTheDocument();
    // 説明テキストは表示される
    expect(screen.getByText('ほとんどの人が揺れを感じる')).toBeInTheDocument();
  });

  // サイズバリエーションテスト
  it('各サイズでレンダリングできる', () => {
    const { rerender } = render(
      <IntensityGauge intensity="4" language="ja" size="sm" />
    );
    expect(screen.getByLabelText('震度4')).toBeInTheDocument();

    rerender(<IntensityGauge intensity="4" language="ja" size="lg" />);
    expect(screen.getByLabelText('震度4')).toBeInTheDocument();
  });

  // 不明な震度へのフォールバック
  it('不明な震度はデフォルト値にフォールバックする', () => {
    render(<IntensityGauge intensity="unknown" language="ja" />);

    // エラーなくレンダリングされること
    const gaugeElement = screen.getByRole('img');
    expect(gaugeElement).toBeInTheDocument();
  });
});

describe('IntensityBadge', () => {
  it('震度バッジを正しく表示する', () => {
    render(<IntensityBadge intensity="5強" language="ja" />);

    // 5強 → 5+ に変換されて表示
    expect(screen.getByText('5+')).toBeInTheDocument();
    expect(screen.getByLabelText('Intensity 5強')).toBeInTheDocument();
  });

  it('震度1のバッジを表示する', () => {
    render(<IntensityBadge intensity="1" language="ja" />);

    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

describe('IntensityScale', () => {
  it('全9段階の震度スケールを表示する', () => {
    const { container } = render(
      <IntensityScale currentIntensity="4" language="ja" />
    );

    // 全9段階が表示されること（1, 2, 3, 4, 5-, 5+, 6-, 6+, 7）
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('5-');
    expect(container.textContent).toContain('5+');
    expect(container.textContent).toContain('6-');
    expect(container.textContent).toContain('6+');
    expect(container.textContent).toContain('7');
  });
});
