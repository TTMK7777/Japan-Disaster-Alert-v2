/**
 * 震度別インフラ影響の文言が16言語で健全であることを固定する。
 *
 * この文言は安全情報として配るので、痩せたり強まったりすると実害がある。
 * とくに次の3つは、目で見ても気づきにくい:
 *  - どこか1言語だけ欠けて英語にフォールバックする
 *  - 非断定（〜することがある）が断定に強まる
 *  - `transit` の限定節（基準は事業者・地域で異なる）が落ちる
 */
import { describe, it, expect } from 'vitest';
import { IMPACT_TEXT } from '../impactText';
import { impactsFor } from '@/lib/intensityImpact';

const LANGS = [
  'ja', 'en', 'zh', 'zh-TW', 'ko', 'vi', 'th', 'id',
  'ms', 'tl', 'ne', 'fr', 'de', 'it', 'es', 'easy_ja',
] as const;

const KEYS = [
  'heading', 'transit', 'gas', 'utility', 'elevator',
  'messageService', 'widespread', 'disclaimer',
] as const;

describe('16言語の網羅', () => {
  it.each(KEYS)('%s が16言語すべてを持つ', (key) => {
    const entry = IMPACT_TEXT[key];
    expect(entry, `キー ${key} が無い`).toBeDefined();
    for (const lang of LANGS) {
      expect(entry[lang], `${key}/${lang} が欠けている`).toBeTruthy();
      expect(entry[lang].trim().length, `${key}/${lang} が空`).toBeGreaterThan(0);
    }
  });

  it('余分な言語コードが混ざっていない', () => {
    // zh-CN や ar のような、このアプリが対応しない言語コードを足しても
    // 誰にも表示されず、保守の手間だけが増える
    for (const key of KEYS) {
      const extra = Object.keys(IMPACT_TEXT[key]).filter((l) => !LANGS.includes(l as never));
      expect(extra, `${key} に未対応の言語コード`).toEqual([]);
    }
  });

  it('影響項目のキーがすべて文言を持つ', () => {
    // lib 側に項目を足して文言を忘れると、画面に空行が出る
    for (const key of impactsFor('7')) {
      expect(IMPACT_TEXT[key], `影響項目 ${key} の文言が無い`).toBeDefined();
    }
  });
});

describe('原文の断定度を保つ', () => {
  // 気象庁の原文で「〜することがある」と非断定に書かれている項目。
  // 訳で断定に強めると、起きるとは限らないことを断言することになる
  const NON_ASSERTIVE_MARKERS: Record<string, RegExp> = {
    ja: /ことがあります|こともあります/,
    en: /\bmay\b/i,
    zh: /可能/,
    'zh-TW': /可能/,
    ko: /수 있습니다/,
    vi: /có thể/i,
    th: /อาจ/,
    id: /dapat|bisa|mungkin/i,
    ms: /boleh|mungkin/i,
    tl: /maaari/i,
    ne: /सक्छ/,
    fr: /peu(ven|t)|pourrai/i,
    de: /kann|können|könnte/i,
    it: /po(sso|uò)no?|può/i,
    es: /pueden|puede/i,
    easy_ja: /ことが あります|ことも あります/,
  };

  it.each(['utility', 'widespread'] as const)(
    '%s は全言語で非断定のまま',
    (key) => {
      for (const lang of LANGS) {
        const text = IMPACT_TEXT[key][lang];
        expect(
          NON_ASSERTIVE_MARKERS[lang].test(text),
          `${key}/${lang} が断定に強まっている: ${text}`
        ).toBe(true);
      }
    }
  );

  it('elevator の後半（運転再開の遅れ）が全言語で非断定', () => {
    for (const lang of LANGS) {
      const text = IMPACT_TEXT.elevator[lang];
      expect(
        NON_ASSERTIVE_MARKERS[lang].test(text),
        `elevator/${lang} に非断定表現が無い: ${text}`
      ).toBe(true);
    }
  });
});

describe('限定節を落とさない', () => {
  // 気象庁の原文は「各事業者の判断によって」「基準は、事業者や地域によって異なる」と
  // 明示している。この限定を落とすと断定が強くなりすぎる。
  //
  // 当初は「文字数が一定以上あること」で代用しようとしたが、
  // **CJK は同じ内容がずっと短くなる**ため中国語が誤検知した（36字だが限定節はある）。
  // 長さという代理指標ではなく、「異なる／vary」に当たる語そのものを見る。
  const VARIES: Record<string, RegExp> = {
    ja: /異なります/,
    en: /vary/i,
    zh: /而异|不同/,
    'zh-TW': /而異|不同/,
    ko: /다릅니다|다를/,
    vi: /khác nhau/i,
    th: /แตกต่างกัน/,
    id: /berbeda/i,
    ms: /berbeza/i,
    tl: /iba-iba/i,
    ne: /फरक/,
    fr: /varient|variables?/i,
    de: /variieren|unterschiedlich/i,
    it: /variano|diversi/i,
    es: /var(í|i)an/i,
    easy_ja: /ちがいます/,
  };

  it.each(LANGS)('transit/%s に限定節が残っている', (lang) => {
    const text = IMPACT_TEXT.transit[lang];
    expect(
      VARIES[lang].test(text),
      `transit/${lang} から「基準は事業者・地域で異なる」が落ちている: ${text}`
    ).toBe(true);
  });
});

describe('行動指示に変換しない', () => {
  // この表は現象・被害の記述であって行動指示ではない。
  // 「エレベーターを使わないでください」はアプリ独自の助言であり出典が違う
  const IMPERATIVE = /please\b|do not\b|veuillez|bitte |por favor|harap |sila |paki|กรุณา|请\s*(勿|不要)|하십시오|하세요|hãy |してください|しないで/i;

  it.each(KEYS)('%s に命令形が混ざっていない', (key) => {
    for (const lang of LANGS) {
      const text = IMPACT_TEXT[key][lang];
      expect(IMPERATIVE.test(text), `${key}/${lang} が命令形になっている: ${text}`).toBe(false);
    }
  });
});

describe('文字列の健全性', () => {
  it('文字化け（U+FFFD）が無い', () => {
    for (const key of KEYS) {
      for (const lang of LANGS) {
        expect(IMPACT_TEXT[key][lang], `${key}/${lang}`).not.toContain('�');
      }
    }
  });

  it('狭い画面に収まる長さに収まっている', () => {
    // 390px 幅を想定。極端に長い訳が混ざるとカードが崩れる
    for (const key of KEYS) {
      for (const lang of LANGS) {
        expect(
          IMPACT_TEXT[key][lang].length,
          `${key}/${lang} が長すぎる（${IMPACT_TEXT[key][lang].length}字）`
        ).toBeLessThan(200);
      }
    }
  });
});

describe('免責が原文の両方向を保つ', () => {
  /*
   * 気象庁の留意事項(4) は「これより大きな被害が発生したり、
   * **逆に小さな被害にとどまる場合もあります**」と両方向に触れている。
   *
   * この実装では一度、日本語の原文を書き起こす段階で「小さい側」を落としてしまい、
   * それを元に訳した14言語すべてに片側だけの免責が伝播した。
   * 片側だけだと、実際には軽く済む場合にも過度に不安を与える警告になる。
   *
   * 翻訳の誤りではなく**原文の写し取りの誤り**なので、訳文をいくら見比べても
   * 見つからない。両側のマーカーを個別に確認する。
   */
  const GREATER: Record<string, RegExp> = {
    ja: /大きい|大きな/, en: /greater|larger/i, zh: /更大/, 'zh-TW': /更大/,
    ko: /클 수도|더 클/, vi: /lớn hơn/i, th: /มากกว่า/, id: /lebih besar/i,
    ms: /lebih besar/i, tl: /mas malaki/i, ne: /ठूलो/, fr: /plus ou moins|plus importants/i,
    de: /größer/i, it: /maggiori/i, es: /mayores/i, easy_ja: /おおきい/,
  };
  const SMALLER: Record<string, RegExp> = {
    ja: /小さい|小さな/, en: /smaller/i, zh: /更小/, 'zh-TW': /更小/,
    ko: /작을 수도|더 작/, vi: /nhỏ hơn/i, th: /น้อยกว่า/, id: /lebih kecil/i,
    ms: /lebih kecil/i, tl: /mas maliit/i, ne: /सानो/, fr: /plus ou moins|moins importants/i,
    de: /geringer|kleiner/i, it: /minori/i, es: /menores/i, easy_ja: /ちいさい/,
  };

  it.each(LANGS)('disclaimer/%s が「より大きい」側に触れている', (lang) => {
    const text = IMPACT_TEXT.disclaimer[lang];
    expect(GREATER[lang].test(text), `${lang}: ${text}`).toBe(true);
  });

  it.each(LANGS)('disclaimer/%s が「より小さい」側に触れている', (lang) => {
    const text = IMPACT_TEXT.disclaimer[lang];
    expect(SMALLER[lang].test(text), `${lang}: ${text}`).toBe(true);
  });

  it.each(LANGS)('disclaimer/%s が非断定のまま', (lang) => {
    const text = IMPACT_TEXT.disclaimer[lang];
    const marker: Record<string, RegExp> = {
      ja: /あります/, en: /may /i, zh: /可能/, 'zh-TW': /可能/,
      ko: /수 (도 )?있습니다|수도/, vi: /có thể/i, th: /อาจ/, id: /bisa|dapat/i,
      ms: /boleh/i, tl: /maaari/i, ne: /सक्छ/, fr: /peuvent/i,
      de: /können/i, it: /possono/i, es: /pueden/i, easy_ja: /あります/,
    };
    expect(marker[lang].test(text), `${lang} が断定に強まっている: ${text}`).toBe(true);
  });
});
