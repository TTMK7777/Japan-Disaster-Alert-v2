import { describe, it, expect } from 'vitest';
import { formatRelativeTime, isStale } from '../relativeTime';

const NOW = new Date('2026-08-24T09:00:00+09:00');

describe('相対時刻', () => {
  it('数分前を分で表す', () => {
    expect(formatRelativeTime('2026-08-24T08:45:00+09:00', 'ja', NOW)).toContain('15');
  });

  it('数時間前を時間で表す', () => {
    const r = formatRelativeTime('2026-08-24T04:00:00+09:00', 'ja', NOW)!;
    expect(r).toContain('5');
  });

  it('数か月前を月で表す', () => {
    // 実データで観測した「3か月前から継続中の注意報」がこの経路に来る
    const r = formatRelativeTime('2026-05-28T10:16:00+09:00', 'ja', NOW)!;
    expect(r).toContain('3');
  });

  it('言語ごとに表現が変わる（16言語ぶんの文言を持たずに済む）', () => {
    const iso = '2026-05-28T10:16:00+09:00';
    expect(formatRelativeTime(iso, 'en', NOW)).toBe('3 months ago');
    expect(formatRelativeTime(iso, 'fr', NOW)).toContain('mois');
    expect(formatRelativeTime(iso, 'de', NOW)).toContain('Monaten');
  });

  describe('タイムゾーンに依存しないこと', () => {
    it('オフセット付きの文字列は端末TZに関係なく同じ結果になる', () => {
      // **訪日客の端末は出国前のタイムゾーンのままであることが多い。**
      // 気象庁の reportDatetime は +09:00 付きなので、絶対時刻として
      // 一意に解釈でき、端末の設定に左右されない
      const iso = '2026-05-28T10:16:00+09:00';
      const sameInstantUtc = '2026-05-28T01:16:00Z';
      expect(formatRelativeTime(iso, 'en', NOW)).toBe(
        formatRelativeTime(sameInstantUtc, 'en', NOW)
      );
    });

    it('オフセットの無い文字列は相対時刻を出さない', () => {
      // 地震の time は "2026/08/23 22:45:00" のようにオフセットが無く、
      // 端末ローカル時刻として解釈されてしまう。
      // 誤った「◯時間前」を出すくらいなら何も出さない
      expect(formatRelativeTime('2026/08/23 22:45:00', 'ja', NOW)).toBeNull();
      expect(formatRelativeTime('2026-08-23T22:45:00', 'ja', NOW)).toBeNull();
    });

    it('解釈できない値では落ちずに null を返す', () => {
      expect(formatRelativeTime('', 'ja', NOW)).toBeNull();
      expect(formatRelativeTime('not-a-date+09:00', 'ja', NOW)).toBeNull();
    });
  });
});

describe('古い情報かの判定', () => {
  it('3か月前は古い', () => {
    expect(isStale('2026-05-28T10:16:00+09:00', NOW)).toBe(true);
  });

  it('1時間前は古くない', () => {
    expect(isStale('2026-08-24T08:00:00+09:00', NOW)).toBe(false);
  });

  it('オフセットが無ければ判定しない', () => {
    expect(isStale('2026/05/28 10:16:00', NOW)).toBe(false);
  });
});
