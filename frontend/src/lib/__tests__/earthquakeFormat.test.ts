import { describe, it, expect } from 'vitest';
import { formatMagnitude, formatDepth, UNDETERMINED } from '../earthquakeFormat';

/**
 * 未確定値（-1）の表示フォーマット。
 *
 * 「M-1」「-1km」は**実際に画面へ出ていた**バグで、このモジュール自体が
 * その修正として作られたのに、テストが 1 本も無かった（レビュー指摘）。
 * `magnitude > UNDETERMINED` の境界判定は 1 文字変えるだけで同じ回帰が
 * 再発するので、境界の両側を固定する。
 */

describe('formatMagnitude', () => {
  it('未確定（-1）はダッシュにする', () => {
    expect(formatMagnitude(-1)).toBe('—');
    expect(formatMagnitude(UNDETERMINED)).toBe('—');
  });

  it('境界: M0.0 は実在する値なのでそのまま出す', () => {
    // > UNDETERMINED を >= にすると 0 が消える
    expect(formatMagnitude(0)).toContain('0');
    expect(formatMagnitude(0)).not.toBe('—');
  });

  it('通常の値はそのまま出す', () => {
    expect(formatMagnitude(4.2)).toContain('4.2');
    expect(formatMagnitude(7.3)).toContain('7.3');
  });

  it('マイナス記号が紛れ込まない', () => {
    expect(formatMagnitude(-1)).not.toContain('-1');
  });
});

describe('formatDepth', () => {
  it('未確定（-1）はダッシュにする', () => {
    expect(formatDepth(-1)).toBe('—');
  });

  it('境界: ごく浅い地震（0km）は実在するのでそのまま出す', () => {
    expect(formatDepth(0)).toBe('0km');
  });

  it('通常の値は km 付きで出す', () => {
    expect(formatDepth(30)).toBe('30km');
    expect(formatDepth(630)).toBe('630km');
  });

  it('-1km という表記が二度と出ない', () => {
    expect(formatDepth(-1)).not.toContain('-1km');
  });
});
