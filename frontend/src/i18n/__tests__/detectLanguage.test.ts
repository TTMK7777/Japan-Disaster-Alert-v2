import { describe, expect, it } from 'vitest';
import { detectLanguage, resolveInitialLanguage } from '../detectLanguage';
import { LANGUAGES } from '../translations';

describe('detectLanguage', () => {
  it('完全一致するタグをそのまま返す', () => {
    expect(detectLanguage(['ko'])).toBe('ko');
    expect(detectLanguage(['th'])).toBe('th');
  });

  it('地域付きタグを言語コードに落とす', () => {
    expect(detectLanguage(['en-US'])).toBe('en');
    expect(detectLanguage(['fr-CA'])).toBe('fr');
    expect(detectLanguage(['ko-KR'])).toBe('ko');
  });

  it('大文字小文字を区別しない', () => {
    expect(detectLanguage(['EN-us'])).toBe('en');
    expect(detectLanguage(['ZH-tw'])).toBe('zh-TW');
  });

  it('中国語の繁体/簡体を書記体系と地域で振り分ける', () => {
    expect(detectLanguage(['zh-TW'])).toBe('zh-TW');
    expect(detectLanguage(['zh-Hant'])).toBe('zh-TW');
    expect(detectLanguage(['zh-Hant-HK'])).toBe('zh-TW');
    expect(detectLanguage(['zh-HK'])).toBe('zh-TW');
    expect(detectLanguage(['zh-MO'])).toBe('zh-TW');
    expect(detectLanguage(['zh-CN'])).toBe('zh');
    expect(detectLanguage(['zh-Hans'])).toBe('zh');
    expect(detectLanguage(['zh-SG'])).toBe('zh');
    expect(detectLanguage(['zh'])).toBe('zh');
  });

  it('タガログ語の別表記 fil を tl に寄せる', () => {
    expect(detectLanguage(['fil'])).toBe('tl');
    expect(detectLanguage(['fil-PH'])).toBe('tl');
    expect(detectLanguage(['tl-PH'])).toBe('tl');
  });

  it('インドネシア語の旧コード in を id に寄せる', () => {
    expect(detectLanguage(['in'])).toBe('id');
    expect(detectLanguage(['in-ID'])).toBe('id');
  });

  it('優先順位に従い最初に一致した言語を返す', () => {
    expect(detectLanguage(['xx', 'de-AT', 'en'])).toBe('de');
  });

  it('未対応の言語しかない場合は en にフォールバックする', () => {
    expect(detectLanguage(['ru', 'pl'])).toBe('en');
  });

  it('空・未定義・不正値では en にフォールバックする', () => {
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
    expect(detectLanguage(['', '   '])).toBe('en');
  });

  it('日本語話者には ja を返す（やさしい日本語は自動選択しない）', () => {
    expect(detectLanguage(['ja-JP'])).toBe('ja');
    expect(detectLanguage(['ja'])).toBe('ja');
  });

  it('easy_ja は自動判定の結果として返さない', () => {
    const results = [
      'ja', 'ja-JP', 'en-US', 'zh-CN', 'ko-KR', 'ru', 'xx', '',
    ].map((tag) => detectLanguage([tag]));
    expect(results).not.toContain('easy_ja');
  });

  it('やさしい日本語は自動判定されないが、明示選択なら尊重される（resolveInitialLanguage 側の責務）', () => {
    expect(detectLanguage(['ja'])).toBe('ja');
    expect(resolveInitialLanguage('easy_ja', ['ja'])).toBe('easy_ja');
  });

  it('返り値は必ず LANGUAGES に存在するコードである', () => {
    const codes = LANGUAGES.map((l) => l.code);
    const samples = [
      'ja', 'en-GB', 'zh-Hant-TW', 'ko', 'vi-VN', 'th', 'id', 'ms-BN',
      'fil', 'ne-NP', 'fr-BE', 'de-CH', 'it', 'es-MX', 'ar', 'nonsense',
    ];
    for (const tag of samples) {
      expect(codes).toContain(detectLanguage([tag]));
    }
  });
});

describe('resolveInitialLanguage', () => {
  it('保存済みの明示選択を最優先する（ブラウザ言語より強い）', () => {
    expect(resolveInitialLanguage('ko', ['en-US'])).toBe('ko');
    expect(resolveInitialLanguage('ja', ['fr-FR'])).toBe('ja');
  });

  it('未保存なら初回訪問としてブラウザ言語から推定する', () => {
    expect(resolveInitialLanguage(null, ['ko-KR'])).toBe('ko');
    expect(resolveInitialLanguage(undefined, ['zh-Hant-TW'])).toBe('zh-TW');
  });

  it('日本語ブラウザでない初回訪問者に ja を出さない（本修正の主目的）', () => {
    for (const tag of ['en-US', 'ko-KR', 'zh-CN', 'th-TH', 'fr-FR', 'ru-RU']) {
      expect(resolveInitialLanguage(null, [tag])).not.toBe('ja');
    }
  });

  it('保存値が未対応コードなら無視してブラウザ推定に落とす', () => {
    expect(resolveInitialLanguage('klingon', ['ko-KR'])).toBe('ko');
    expect(resolveInitialLanguage('', ['de-DE'])).toBe('de');
  });

  it('保存値もブラウザ言語も無い場合は en になる', () => {
    expect(resolveInitialLanguage(null, [])).toBe('en');
    expect(resolveInitialLanguage(null, null)).toBe('en');
  });
});
