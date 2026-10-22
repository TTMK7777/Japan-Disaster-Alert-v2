import { describe, it, expect } from 'vitest';
import { prefectureDisplayName } from '../prefectures';

/**
 * バナー（「{pref}の情報を表示中」「{pref}に特別警報が出ています」）に差し込む地域名。
 * 警報タブのセレクタ・公式リンクと同じ表記（日本語・やさしい日本語は漢字、それ以外は気象庁のローマ字表記）。
 * 訳文の {pref} に差し込むので、日本語県名に「の情報を表示中」を連結する作りにはしない。
 */
describe('prefectureDisplayName', () => {
  it('日本語・やさしい日本語は漢字の県名', () => {
    expect(prefectureDisplayName('130000', 'ja')).toBe('東京都');
    expect(prefectureDisplayName('471000', 'easy_ja')).toBe('沖縄県');
  });

  it('それ以外の言語はローマ字表記（駅名・標識と照合できる）', () => {
    expect(prefectureDisplayName('130000', 'en')).toBe('Tokyo');
    expect(prefectureDisplayName('016000', 'th')).toBe('Hokkaido');
    expect(prefectureDisplayName('460100', 'zh-TW')).toBe('Kagoshima');
  });

  it('表に無いコード・null は null（"undefined" や生のコードを画面に出さない）', () => {
    expect(prefectureDisplayName('460000', 'ja')).toBeNull();
    expect(prefectureDisplayName(null, 'en')).toBeNull();
    expect(prefectureDisplayName(undefined, 'en')).toBeNull();
  });
});
