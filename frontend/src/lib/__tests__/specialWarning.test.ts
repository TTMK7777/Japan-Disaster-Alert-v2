import { describe, it, expect } from 'vitest';
import { hasActiveSpecialWarning } from '../specialWarning';

/**
 * 特別警報の帯（全タブ共通）を出すかの判定。
 *
 * 入力は /api/v1/alerts の応答（backend の DisasterAlert）。backend は気象庁 JSON の
 * status が「発表」「継続」の警報だけを返し、「解除」「発表警報・注意報はなし」は返さない
 * （warning_service.ACTIVE_WARNING_STATUSES）。特別警報は severity="extreme"
 * （気象庁コード 32/33/35/36/37/38、warning_names.CODE_SPEC）。
 * ここではその応答の形で「継続中も出す・解除は出さない・注意報は出さない」を固定する。
 */

// backend が返す形（DisasterAlert）。値は実データの形に合わせる
const special = (over: Record<string, unknown> = {}) => ({
  id: '130000_33_20261022',
  type: 'special_warning',
  title: '大雨特別警報',
  description: '東京地方に大雨特別警報が発表されています。',
  area: '東京地方',
  issued_at: '2026-10-22T05:00:00+09:00',
  severity: 'extreme',
  is_continuing: false,
  ...over,
});

const warning = { ...special(), id: '130000_03_20261022', type: 'warning', title: '大雨警報', severity: 'high' };
const advisoryMedium = { ...special(), id: '130000_10_20261022', type: 'advisory', title: '大雨注意報', severity: 'medium' };
const advisoryLow = { ...special(), id: '130000_20_20261022', type: 'watch', title: '濃霧注意報', severity: 'low' };

describe('hasActiveSpecialWarning', () => {
  it('新規発表（status 発表）の特別警報があれば true', () => {
    expect(hasActiveSpecialWarning([special()])).toBe(true);
  });

  it('継続中（status 継続 → is_continuing=true）の特別警報も true（継続を落とすと出ている間ずっと見えない）', () => {
    expect(hasActiveSpecialWarning([special({ is_continuing: true })])).toBe(true);
  });

  it('解除された特別警報は応答に含まれない → 残りが警報・注意報だけなら false', () => {
    // 解除後は backend が特別警報を返さない。帯は消える
    expect(hasActiveSpecialWarning([warning, advisoryMedium])).toBe(false);
  });

  it('警報（high）だけでは出さない', () => {
    expect(hasActiveSpecialWarning([warning])).toBe(false);
  });

  it('注意報（medium / low / advisory）だけでは出さない', () => {
    expect(hasActiveSpecialWarning([advisoryMedium, advisoryLow, { ...advisoryLow, severity: 'advisory' }])).toBe(false);
  });

  it('注意報・警報に混じっていても特別警報が 1 件あれば true（並び順に依存しない）', () => {
    expect(hasActiveSpecialWarning([advisoryLow, warning, special({ is_continuing: true })])).toBe(true);
  });

  it('大文字・前後空白の severity も特別警報として扱う（normalizeSeverity と同じ規則）', () => {
    expect(hasActiveSpecialWarning([special({ severity: ' EXTREME ' })])).toBe(true);
  });

  it('空・null・配列でない応答・壊れた要素では false（例外を投げない）', () => {
    expect(hasActiveSpecialWarning([])).toBe(false);
    expect(hasActiveSpecialWarning(null)).toBe(false);
    expect(hasActiveSpecialWarning(undefined)).toBe(false);
    expect(hasActiveSpecialWarning({ detail: 'error' })).toBe(false);
    expect(hasActiveSpecialWarning([null, 1, 'x', {}])).toBe(false);
  });

  it('severity が不明な値は特別警報にしない', () => {
    expect(hasActiveSpecialWarning([special({ severity: 'unknown' })])).toBe(false);
    expect(hasActiveSpecialWarning([special({ severity: undefined })])).toBe(false);
  });
});
