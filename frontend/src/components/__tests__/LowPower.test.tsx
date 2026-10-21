import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FreshnessStatus, LowPowerToggle, BatterySuggestion } from '../LowPower';
import { getTranslation, getLocale } from '@/i18n/translations';

/**
 * 低電力モードの操作部と「最後に取得できた時刻」の表示。
 *
 * - 一度も取れていなければ「未取得」（以前は画面を開いた時刻を最終更新として出しており、
 *   何も取れていなくても新しい情報に見えた）
 * - 失敗したら成功時刻はそのまま、「更新に失敗。前の情報を表示中」を足す
 * - 「今すぐ更新」は取得中は押せない（連打で多重リクエストしない）
 */

const AT = new Date(2026, 9, 21, 14, 30, 0).getTime();

function baseProps(overrides: Partial<React.ComponentProps<typeof FreshnessStatus>> = {}) {
  return {
    language: 'ja',
    lastSuccessAt: AT,
    lastFailed: false,
    refreshing: false,
    onRefresh: vi.fn(),
    lowPower: false,
    nextPollAt: null,
    mode: 'sse' as const,
    connected: true,
    ...overrides,
  };
}

describe('FreshnessStatus', () => {
  it('一度も取れていなければ「未取得」', () => {
    render(<FreshnessStatus {...baseProps({ lastSuccessAt: null })} />);
    expect(screen.getByTestId('last-success')).toHaveTextContent(
      getTranslation('ja', 'freshness.never')
    );
  });

  it('成功時刻を出す', () => {
    render(<FreshnessStatus {...baseProps()} />);
    const expected = new Date(AT).toLocaleTimeString(getLocale('ja'), {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByTestId('last-success')).toHaveTextContent(expected);
    expect(screen.queryByTestId('fetch-failed')).toBeNull();
  });

  it('失敗したら成功時刻を残したまま「前の情報を表示中」を出す', () => {
    render(<FreshnessStatus {...baseProps({ lastFailed: true })} />);
    const expected = new Date(AT).toLocaleTimeString(getLocale('ja'), {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByTestId('last-success')).toHaveTextContent(expected);
    expect(screen.getByTestId('fetch-failed')).toHaveTextContent(
      getTranslation('ja', 'freshness.failed')
    );
  });

  it('一度も取れないまま失敗したら「前の情報」とは言わない', () => {
    render(<FreshnessStatus {...baseProps({ lastSuccessAt: null, lastFailed: true })} />);
    expect(screen.getByTestId('last-success')).toHaveTextContent(
      getTranslation('ja', 'freshness.never')
    );
    expect(screen.getByTestId('fetch-failed')).toHaveTextContent(
      getTranslation('ja', 'freshness.failedNever')
    );
  });

  it('「今すぐ更新」を押すと onRefresh、取得中は押せない', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<FreshnessStatus {...baseProps({ onRefresh })} />);
    const button = screen.getByRole('button', { name: getTranslation('ja', 'freshness.refresh') });
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(<FreshnessStatus {...baseProps({ onRefresh, refreshing: true })} />);
    const busy = screen.getByRole('button', { name: getTranslation('ja', 'freshness.refreshing') });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('低電力モード中は間隔の説明と次の自動更新を出す', () => {
    const next = AT + 5 * 60 * 1000;
    render(<FreshnessStatus {...baseProps({ lowPower: true, nextPollAt: next, mode: 'polling', connected: false })} />);
    expect(screen.getByTestId('low-power-info')).toHaveTextContent(
      getTranslation('ja', 'lowPower.delayNote')
    );
    expect(screen.getByTestId('next-poll')).toHaveTextContent(
      new Date(next).toLocaleTimeString(getLocale('ja'), { hour: '2-digit', minute: '2-digit' })
    );
  });

  it('通常モードでは低電力の説明を出さない', () => {
    render(<FreshnessStatus {...baseProps()} />);
    expect(screen.queryByTestId('low-power-info')).toBeNull();
  });
});

describe('LowPowerToggle', () => {
  it('状態を aria-pressed で伝え、押すと onToggle', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<LowPowerToggle enabled={false} onToggle={onToggle} language="en" />);
    const button = screen.getByRole('button', { name: getTranslation('en', 'lowPower.label') });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<LowPowerToggle enabled onToggle={onToggle} language="en" />);
    expect(screen.getByRole('button', { name: getTranslation('en', 'lowPower.label') })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

describe('BatterySuggestion', () => {
  it('提案だけで、押されるまで切り替えない', () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    render(<BatterySuggestion language="ja" onAccept={onAccept} onDismiss={onDismiss} />);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: getTranslation('ja', 'lowPower.turnOn') }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: getTranslation('ja', 'lowPower.notNow') }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
