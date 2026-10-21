import { describe, it, expect } from 'vitest';
import { buildPosterTargetUrl } from '../posterUrl';
import { PREFECTURES } from '@/lib/prefectures';

const ORIGIN = 'https://example.test';

describe('buildPosterTargetUrl（QR に入れる URL）', () => {
  it('有効な府県予報区コードなら /?pref=<コード> を付ける', () => {
    expect(buildPosterTargetUrl(ORIGIN, '260000')).toBe('https://example.test/?pref=260000');
  });

  it('先頭ゼロのコードを数値にせず文字列のまま使う（北海道 016000）', () => {
    expect(buildPosterTargetUrl(ORIGIN, '016000')).toBe('https://example.test/?pref=016000');
  });

  it('前後の空白は取り除いてから許可リストに通す', () => {
    expect(buildPosterTargetUrl(ORIGIN, ' 260000 ')).toBe('https://example.test/?pref=260000');
    expect(buildPosterTargetUrl(ORIGIN, '\t130000\n')).toBe('https://example.test/?pref=130000');
  });

  it.each([
    ['存在しない予報区（460000）', '460000'],
    ['数字でない', 'abc'],
    ['桁が足りない', '26000'],
    ['スクリプト片', '"><script>alert(1)</script>'],
    ['空文字', ''],
    ['空白だけ', '   '],
  ])('無効なコード（%s）は地域を固定しない＝ / だけ', (_label, pref) => {
    expect(buildPosterTargetUrl(ORIGIN, pref)).toBe('https://example.test/');
  });

  it.each([null, undefined, 260000, ['260000']])('文字列でない値（%s）は / だけ', (pref) => {
    expect(buildPosterTargetUrl(ORIGIN, pref)).toBe('https://example.test/');
  });

  it('言語は付けない（訪日客のブラウザ言語で自動判定させる）', () => {
    for (const { code } of PREFECTURES) {
      const url = buildPosterTargetUrl(ORIGIN, code);
      expect(url).toBe(`https://example.test/?pref=${code}`);
      expect(url).not.toMatch(/lang=/);
    }
  });

  it('origin は渡されたものをそのまま使う（URL を埋め込まない）', () => {
    expect(buildPosterTargetUrl('http://127.0.0.1:3000', '260000')).toBe('http://127.0.0.1:3000/?pref=260000');
  });
});
