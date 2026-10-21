import { describe, it, expect } from 'vitest';
import { LANGUAGES, translations, errorMessages, boundaryErrorMessages, getTranslation, getLocale, LOCALE_MAP } from '../translations';

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
  // 接続状態インジケーター（ConnectionStatus）・テーマ表示用
  'realtime',
  'polling',
  'disconnected',
  'darkMode',
  'lightMode',
  'systemMode',
];

// Phase 1A: コンポーネント翻訳キー（全16言語で必須）
const COMPONENT_KEYS = [
  'earthquake.intensity',
  'earthquake.depth',
  'earthquake.mag',
  'earthquake.tsunami',
  'earthquake.noData',
  'common.retry',
  'map.intensity',
  'map.magnitude',
  'map.depth',
  'map.time',
  'map.tsunami',
  'map.legend',
  'map.noLocation',
  'map.showImpact',
  'warning.title',
  'warning.noWarnings',
  'warning.error',
  'warning.issuedAt',
  'warning.continuing',
  'warning.specialWarning',
  'warning.severityWarning',
  'warning.advisory',
  'warning.selectArea',
  'tsunami.findShelter',
  // このアプリが扱う範囲の帯・警報タブの県リンク（components/ScopeNotice.tsx）
  'scope.jmaRelay',
  'scope.notCovered',
  'scope.prefectureLink',
  'scope.travelerLink',
  // 地域の明示・特別警報の帯（B8。components/RegionBar.tsx・SpecialWarningBand.tsx）
  'region.showing',
  'region.change',
  'region.officialSwitchHint',
  'warning.specialBanner',
  'warning.view',
  // 低電力モード・最後に取得できた時刻（components/LowPower.tsx, ShelterMap の地図遅延）
  'lowPower.label',
  'lowPower.on',
  'lowPower.off',
  'lowPower.description',
  'lowPower.notifyNote',
  'lowPower.delayNote',
  'lowPower.showMap',
  'lowPower.mapDeferred',
  'lowPower.batterySuggest',
  'lowPower.turnOn',
  'lowPower.notNow',
  'freshness.lastFetched',
  'freshness.never',
  'freshness.failed',
  'freshness.failedNever',
  'freshness.refresh',
  'freshness.refreshing',
  'freshness.nextUpdate',
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

  // Phase 1A: コンポーネント翻訳キーが全16言語に存在すること
  it('コンポーネント翻訳キーが全16言語に存在する', () => {
    const langCodes = LANGUAGES.map((l) => l.code);
    const missing: string[] = [];

    langCodes.forEach((code) => {
      COMPONENT_KEYS.forEach((key) => {
        if (!translations[code]?.[key]) {
          missing.push(`${code}.${key}`);
        }
      });
    });

    if (missing.length > 0) {
      console.warn('不足しているコンポーネント翻訳:', missing);
    }
    expect(missing).toEqual([]);
  });

  // イタリア語が英語フォールバックでないことを確認
  it('イタリア語が独自の翻訳を持つ（英語フォールバックでない）', () => {
    const itKeys = translations['it'];
    const enKeys = translations['en'];

    // コンポーネントキーでイタリア語が英語と異なることを確認
    const keysToCheck = ['earthquake.depth', 'earthquake.intensity', 'warning.title', 'map.legend'];
    keysToCheck.forEach((key) => {
      expect(itKeys[key]).toBeDefined();
      expect(itKeys[key]).not.toEqual(enKeys[key]);
    });
  });
});

describe('getTranslation', () => {
  it('指定言語の翻訳を返す', () => {
    expect(getTranslation('it', 'earthquake.depth')).toBe('Profondità');
    expect(getTranslation('ja', 'earthquake.depth')).toBe('深さ');
  });

  it('未定義言語は英語にフォールバック', () => {
    expect(getTranslation('xx', 'earthquake.depth')).toBe('Depth');
  });
});

describe('getLocale', () => {
  it('全16言語にBCP47ロケールが定義されている', () => {
    const langCodes = LANGUAGES.map((l) => l.code);
    langCodes.forEach((code) => {
      expect(LOCALE_MAP[code]).toBeDefined();
    });
  });

  it('イタリア語のロケールがit-ITである', () => {
    expect(getLocale('it')).toBe('it-IT');
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

describe('B8 の文言', () => {
  const langCodes = LANGUAGES.map((l) => l.code);

  it('地域名を差し込む 2 キーは全 16 言語で {pref} をちょうど 1 つ持つ（訳で崩れていない）', () => {
    for (const code of langCodes) {
      for (const key of ['region.showing', 'warning.specialBanner']) {
        const text = translations[code][key];
        expect(text.split('{pref}').length - 1, `${code}.${key}`).toBe(1);
      }
    }
  });

  it('scope.jmaRelay は肯定形（「公式発表ではない」で警報そのものを疑わせない）', () => {
    expect(translations.ja['scope.jmaRelay']).toBe(
      'このアプリは、気象庁が発表した警報・情報をお伝えします。避難については、市町村の指示に従ってください。'
    );
    expect(translations.ja['scope.jmaRelay']).not.toContain('公式発表ではありません');
    expect(translations.en['scope.jmaRelay']).not.toMatch(/not official/i);
  });

  it('地域の選択の 12 キーは全 16 言語が自分の訳を持つ（英語の流用ではない。easy_ja も英語にしない）', () => {
    const keys = Object.keys(translations.ja).filter((k) => k.startsWith('region.'));
    expect(keys.length).toBe(15); // 先行 3 キー（showing・change・officialSwitchHint）＋地域の選択 12 キー
    for (const code of langCodes) {
      for (const key of keys) {
        expect(translations[code][key], `${code}.${key}`).toBeTruthy();
        if (code !== 'en') expect(translations[code][key], `${code}.${key}`).not.toBe(translations.en[key]);
      }
    }
  });

  it('chooseHint の「警報・注意報」は各言語の既存の警報・注意報の訳語と揃える', () => {
    for (const code of langCodes) {
      const hint = translations[code]['region.chooseHint'].toLowerCase();
      expect(hint, code).toContain(translations[code]['warning.advisory'].toLowerCase().slice(0, 4));
    }
  });
});
