import { describe, expect, it } from 'vitest';
import { readLangParam, readPrefParam, withQueryParam } from '../urlPreferences';
import { PREFECTURES } from '../prefectures';
import { LANGUAGES } from '@/i18n/translations';

/**
 * URL で表示言語と地域を指定する（`?lang=` / `?pref=`）。
 *
 * 宿の QR は地域だけを固定し、言語は利用者のブラウザから判定させたい。
 * 英語サイトからのリンクなどは言語も固定したい（docs/dev/touchpoints-2026.md §3.3）。
 *
 * 値は**許可リストに通ったものだけ**を返す。URL の文字列をそのまま
 * 画面や `<html lang>` に流さないため、無効値は null（＝無視して従来の判定へ）。
 */

describe('readLangParam', () => {
  it('クエリが無ければ null', () => {
    expect(readLangParam('')).toBeNull();
    expect(readLangParam('?')).toBeNull();
    expect(readLangParam('?pref=260000')).toBeNull();
  });

  it('空の値は null', () => {
    expect(readLangParam('?lang=')).toBeNull();
    expect(readLangParam('?lang=%20')).toBeNull();
  });

  it('対応していない言語は null', () => {
    expect(readLangParam('?lang=xx')).toBeNull();
    expect(readLangParam('?lang=ru')).toBeNull();
    expect(readLangParam('?lang=en_US')).toBeNull();
    expect(readLangParam('?lang=%3Cscript%3E')).toBeNull();
  });

  it('対応言語のコードはそのまま返す', () => {
    expect(readLangParam('?lang=ko')).toBe('ko');
    expect(readLangParam('?lang=en')).toBe('en');
  });

  it('16 言語すべてのコードが有効（easy_ja を含む）', () => {
    for (const { code } of LANGUAGES) {
      expect(readLangParam(`?lang=${encodeURIComponent(code)}`)).toBe(code);
    }
  });

  it('大文字小文字を区別しない', () => {
    expect(readLangParam('?lang=KO')).toBe('ko');
    expect(readLangParam('?lang=ZH-tw')).toBe('zh-TW');
    expect(readLangParam('?lang=EASY_JA')).toBe('easy_ja');
  });

  it('地域付きタグはブラウザ判定と同じ正規化で解釈する', () => {
    expect(readLangParam('?lang=en-US')).toBe('en');
    expect(readLangParam('?lang=ko-KR')).toBe('ko');
    expect(readLangParam('?lang=zh-TW')).toBe('zh-TW');
    expect(readLangParam('?lang=zh-Hant')).toBe('zh-TW');
    expect(readLangParam('?lang=zh-CN')).toBe('zh');
  });

  it('同じキーが重複したら先頭の値だけを見る', () => {
    expect(readLangParam('?lang=en&lang=ko')).toBe('en');
    // 先頭が無効なら後ろを拾わずに無視する（どれを採ったか利用者から見えないため）
    expect(readLangParam('?lang=xx&lang=ko')).toBeNull();
  });

  it('他のクエリと並んでいても拾う', () => {
    expect(readLangParam('?utm_source=qr&lang=th&pref=260000')).toBe('th');
  });
});

describe('readPrefParam', () => {
  it('クエリが無い・空なら null', () => {
    expect(readPrefParam('')).toBeNull();
    expect(readPrefParam('?lang=ko')).toBeNull();
    expect(readPrefParam('?pref=')).toBeNull();
  });

  it('アプリの都道府県コード（気象庁の府県予報区 6 桁）を受け付ける', () => {
    expect(readPrefParam('?pref=260000')).toBe('260000');
    expect(readPrefParam('?pref=130000')).toBe('130000');
    expect(readPrefParam('?pref=460100')).toBe('460100');
  });

  it('セレクタにある全都道府県のコードが有効', () => {
    for (const { code } of PREFECTURES) {
      expect(readPrefParam(`?pref=${code}`)).toBe(code);
    }
  });

  it('前ゼロのある北海道（016000）はそのまま通り、前ゼロが欠けた値は通さない', () => {
    expect(readPrefParam('?pref=016000')).toBe('016000');
    expect(readPrefParam('?pref=16000')).toBeNull();
  });

  it('表に無いコード・別形式は null', () => {
    // 460000 は気象庁に存在しない（404 で永久ゼロ件になる）コード
    expect(readPrefParam('?pref=460000')).toBeNull();
    expect(readPrefParam('?pref=26')).toBeNull();
    expect(readPrefParam('?pref=kyoto')).toBeNull();
    expect(readPrefParam('?pref=2600000')).toBeNull();
    expect(readPrefParam('?pref=%3Cimg%3E')).toBeNull();
  });

  it('前後の空白は落としてから照合する', () => {
    expect(readPrefParam('?pref=+260000+')).toBe('260000');
  });

  it('同じキーが重複したら先頭の値だけを見る', () => {
    expect(readPrefParam('?pref=260000&pref=270000')).toBe('260000');
    expect(readPrefParam('?pref=999999&pref=270000')).toBeNull();
  });
});

describe('withQueryParam', () => {
  it('キーが無ければ足す', () => {
    expect(withQueryParam('/', '', '', 'lang', 'ko')).toBe('/?lang=ko');
  });

  it('既存の値を置き換え、他のクエリと hash は残す', () => {
    expect(withQueryParam('/', '?utm_source=qr&lang=en', '#tab', 'lang', 'fr')).toBe(
      '/?utm_source=qr&lang=fr#tab'
    );
  });

  it('重複したキーは 1 つにまとめる', () => {
    expect(withQueryParam('/', '?lang=en&lang=ko', '', 'lang', 'fr')).toBe('/?lang=fr');
  });

  it('もう片方のキーには触れない', () => {
    expect(withQueryParam('/', '?pref=260000', '', 'lang', 'zh-TW')).toBe(
      '/?pref=260000&lang=zh-TW'
    );
  });
});
