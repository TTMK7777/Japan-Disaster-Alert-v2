import { describe, it, expect } from 'vitest';
import { LANGUAGES, translations, errorMessages, boundaryErrorMessages } from '../translations';

// 必要な翻訳キー一覧
const REQUIRED_KEYS = [
  'title',
  'subtitle',
  'earthquake',
  'warning',
  'emergency',
  'shelter',
  'settings',
  'loading',
  'noData',
  'lastUpdate',
  'listView',
  'mapView',
  'safetyTips',
  'dataSource',
  'disclaimer',
];

describe('translations', () => {
  // 全16言語が LANGUAGES に登録されていること
  it('全16言語がLANGUAGESに登録されている', () => {
    expect(LANGUAGES).toHaveLength(16);

    const codes = LANGUAGES.map((l) => l.code);
    expect(codes).toContain('ja');
    expect(codes).toContain('en');
    expect(codes).toContain('zh');
    expect(codes).toContain('zh-TW');
    expect(codes).toContain('ko');
    expect(codes).toContain('vi');
    expect(codes).toContain('th');
    expect(codes).toContain('id');
    expect(codes).toContain('ms');
    expect(codes).toContain('tl');
    expect(codes).toContain('ne');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('it');
    expect(codes).toContain('es');
    expect(codes).toContain('easy_ja');
  });

  // 全言語にflagとnameが設定されていること
  it('全言語にflagとnameが設定されている', () => {
    LANGUAGES.forEach((lang) => {
      expect(lang.flag).toBeTruthy();
      expect(lang.name).toBeTruthy();
      expect(lang.code).toBeTruthy();
    });
  });

  // translationsに全16言語が存在すること
  it('translationsに全16言語のエントリが存在する', () => {
    const langCodes = LANGUAGES.map((l) => l.code);

    langCodes.forEach((code) => {
      expect(translations[code]).toBeDefined();
    });
  });

  // 全言語に必要なキーが揃っていること
  it('全言語に必要な翻訳キーが存在する', () => {
    const langCodes = LANGUAGES.map((l) => l.code);
    const missingTranslations: string[] = [];

    langCodes.forEach((code) => {
      if (!translations[code]) {
        missingTranslations.push(`${code}: 言語エントリが存在しない`);
        return;
      }

      REQUIRED_KEYS.forEach((key) => {
        if (!translations[code][key]) {
          missingTranslations.push(`${code}.${key}`);
        }
      });
    });

    if (missingTranslations.length > 0) {
      console.warn('不足している翻訳:', missingTranslations);
    }
    expect(missingTranslations).toEqual([]);
  });

  // 空文字列の翻訳がないこと
  it('空文字列の翻訳が存在しない', () => {
    const emptyTranslations: string[] = [];

    Object.entries(translations).forEach(([lang, keys]) => {
      Object.entries(keys).forEach(([key, value]) => {
        if (value.trim() === '') {
          emptyTranslations.push(`${lang}.${key}`);
        }
      });
    });

    expect(emptyTranslations).toEqual([]);
  });

  // 日本語と英語の翻訳キーが一致していること
  it('日本語と英語で同じキーセットを持つ', () => {
    const jaKeys = Object.keys(translations['ja']).sort();
    const enKeys = Object.keys(translations['en']).sort();

    expect(jaKeys).toEqual(enKeys);
  });
});

describe('errorMessages', () => {
  const ERROR_KEYS = ['networkError', 'serverError', 'retry'];

  // 全エラーメッセージタイプが存在すること
  it('全エラーメッセージキーが存在する', () => {
    ERROR_KEYS.forEach((key) => {
      expect(errorMessages[key]).toBeDefined();
    });
  });

  // 全16言語にエラーメッセージがあること
  it('全16言語にエラーメッセージが定義されている', () => {
    const langCodes = LANGUAGES.map((l) => l.code);
    const missing: string[] = [];

    ERROR_KEYS.forEach((errorKey) => {
      langCodes.forEach((code) => {
        if (!errorMessages[errorKey][code]) {
          missing.push(`${errorKey}.${code}`);
        }
      });
    });

    if (missing.length > 0) {
      console.warn('不足しているエラーメッセージ:', missing);
    }
    expect(missing).toEqual([]);
  });
});

describe('boundaryErrorMessages', () => {
  // 主要言語にErrorBoundaryメッセージがあること
  it('主要言語にErrorBoundaryメッセージが定義されている', () => {
    const requiredLangs = ['ja', 'en', 'easy_ja', 'zh', 'zh-TW', 'ko', 'vi', 'ne', 'th', 'id', 'ms', 'tl', 'fr', 'de', 'it', 'es'];

    requiredLangs.forEach((code) => {
      expect(boundaryErrorMessages[code]).toBeDefined();
      expect(boundaryErrorMessages[code].title).toBeTruthy();
      expect(boundaryErrorMessages[code].message).toBeTruthy();
      expect(boundaryErrorMessages[code].retry).toBeTruthy();
    });
  });
});
