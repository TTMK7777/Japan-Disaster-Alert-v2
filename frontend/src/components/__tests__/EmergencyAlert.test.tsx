import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import EmergencyAlert from '../EmergencyAlert';
import type { TsunamiLike } from '@/lib/emergencyAlert';

/**
 * 全画面警報の配線テスト。
 *
 * lib/emergencyAlert.ts の純粋ロジックは lib 側のテストが持つが、
 * ここで固定するのは**コンポーネント配線の回帰**:
 *
 * - 自動解除カウントダウンは、導出オブジェクトの参照が毎レンダー変わることで
 *   effect が毎秒リセットされ、**30⇄29 を永久に振動して一度も完了しなかった**
 *   （レビューで2名が独立に発見）。手動テストボタンは useState 由来で参照が
 *   安定しているため、手動確認ではこの回帰を検知できない — だからテストで固定する
 * - role="alertdialog" + aria-modal は宣言だけでは効かず、フォーカス移動を
 *   実装しなければキーボード利用者は背後の UI へ抜けてしまう
 */

const ADVISORY: TsunamiLike[] = [{ id: 't-adv', warning_level: 'advisory' }];
const WARNING: TsunamiLike[] = [{ id: 't-warn', warning_level: 'warning' }];

beforeEach(() => {
  vi.useFakeTimers();
  // マウント時の /api/v1/tsunami/active 取得を止める（props で渡すため不要）
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('自動解除カウントダウン', () => {
  it('注意報はカウントダウンが実際に進み、0で自動的に閉じる', async () => {
    // 時刻を固定する。ダイアログには発表時刻（時:分:秒）も出るため、
    // 以前は全文に '30' が含まれるか見ていて 22:30 台などに落ちていた（偽レッド）。
    // 逆に xx:25 台なら '25' が時刻だけで満たされ、カウントダウンが止まっていても通っていた（偽グリーン）。
    // 両方を踏む時刻（22:30:25）に固定し、検査はカウントダウン要素に限定する
    vi.setSystemTime(new Date(2026, 9, 22, 22, 30, 25));
    render(<EmergencyAlert language="en" tsunamis={ADVISORY} />);
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    // 5 秒進める。振動バグがあるとここで 30 に戻り続ける
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('alert-countdown').textContent).toBe(' (25s)');

    // 残りを進めると自動で閉じる
    await act(async () => {
      vi.advanceTimersByTime(26_000);
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('再レンダーが起きてもカウントダウンはリセットされない', async () => {
    // 同じ内容の新しい配列 = SSE の再配信を模す。参照は毎回変わる
    const { rerender } = render(<EmergencyAlert language="en" tsunamis={ADVISORY} />);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    rerender(<EmergencyAlert language="en" tsunamis={[...ADVISORY]} />);
    await act(async () => {
      vi.advanceTimersByTime(21_000);
    });
    // 合計 31 秒経過。リセットされていれば開いたまま
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('津波警報は自動で閉じない', async () => {
    render(<EmergencyAlert language="en" tsunamis={WARNING} />);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('引き上げ（注意報→警報）が来たら抑制を貫通して警報が出る', async () => {
    const { rerender } = render(<EmergencyAlert language="en" tsunamis={ADVISORY} />);
    // 注意報を自動解除まで進める
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // 同じ地震の警報への引き上げ（id は同じでも warning_level が違う）
    rerender(
      <EmergencyAlert language="en" tsunamis={[{ id: 't-adv', warning_level: 'warning' }]} />
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});

describe('フォーカス管理', () => {
  it('開いたときにフォーカスがダイアログ内へ移る', () => {
    render(<EmergencyAlert language="en" tsunamis={WARNING} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('閉じたら元の要素へフォーカスが戻る', async () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    outside.focus();

    render(<EmergencyAlert language="en" tsunamis={ADVISORY} />);
    expect(document.activeElement).not.toBe(outside);

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe('種別不明（unknown）の津波情報', () => {
  const UNKNOWN: TsunamiLike[] = [{ id: 't-unk', warning_level: 'unknown' }];

  it('全画面に出て、公式情報の確認を促す', () => {
    render(<EmergencyAlert language="en" tsunamis={UNKNOWN} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Tsunami Information Issued');
    expect(dialog.textContent).toContain('Check official information');
  });

  it('日本語でも出る', () => {
    render(<EmergencyAlert language="ja" tsunamis={UNKNOWN} />);
    expect(screen.getByRole('alertdialog').textContent).toContain('公式情報を確認してください');
  });

  it('自動では閉じない', async () => {
    render(<EmergencyAlert language="en" tsunamis={UNKNOWN} />);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('避難所を探すボタンを出す', () => {
    render(<EmergencyAlert language="en" tsunamis={UNKNOWN} />);
    expect(screen.getByRole('button', { name: 'Find Shelter' })).toBeTruthy();
  });
});
