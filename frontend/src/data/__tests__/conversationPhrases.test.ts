import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/i18n/translations';
import {
  CONVERSATION_CATEGORY_ORDER,
  CONVERSATION_PHRASES,
} from '@/data/conversationPhrases';
import { CONVERSATION_UI_TEXT } from '@/data/conversationUiText';

const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
const EXPECTED_IDS = Array.from({ length: 40 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);

describe('会話カードの文例データ', () => {
  it('C01〜C40 の 40 文がちょうど 1 回ずつある', () => {
    expect(CONVERSATION_PHRASES.map((p) => p.id)).toEqual(EXPECTED_IDS);
  });

  it('言語の一覧は 16 言語（translations.ts の LANGUAGES）', () => {
    expect(LANGUAGE_CODES).toHaveLength(16);
  });

  // 1 文 × 1 言語でも欠けたら落ちる（640 件を個別に検査する）
  for (const id of EXPECTED_IDS) {
    for (const lang of LANGUAGE_CODES) {
      it(`${id} の ${lang} の訳がある`, () => {
        const phrase = CONVERSATION_PHRASES.find((p) => p.id === id);
        const text = (phrase?.text as Record<string, string> | undefined)?.[lang];
        expect(typeof text).toBe('string');
        expect(text?.trim().length ?? 0).toBeGreaterThan(0);
      });
    }
  }

  it('16 言語以外のキーを持たない', () => {
    for (const p of CONVERSATION_PHRASES) {
      expect(Object.keys(p.text).sort()).toEqual([...LANGUAGE_CODES].sort());
    }
  });

  it('方向は 2 種類のどちらかで、両方の向きの文がある', () => {
    const directions = new Set(CONVERSATION_PHRASES.map((p) => p.direction));
    expect([...directions].sort()).toEqual(['staff-to-visitor', 'visitor-to-staff']);
  });

  it('文例表の方向どおり（スタッフ→訪日客は 14 文）', () => {
    const staff = CONVERSATION_PHRASES.filter((p) => p.direction === 'staff-to-visitor').map((p) => p.id);
    expect(staff).toEqual([
      'C04', 'C06', 'C09', 'C13', 'C16', 'C20', 'C22', 'C25', 'C27', 'C29', 'C31', 'C33', 'C38', 'C40',
    ]);
  });

  it('カテゴリの順は命に関わる順（緊急→けが→持病・薬→アレルギー→家族→…）', () => {
    expect(CONVERSATION_CATEGORY_ORDER.slice(0, 5)).toEqual([
      'emergency',
      'injury',
      'medication',
      'allergy',
      'family',
    ]);
  });

  it('優先順は 1 から連番で、カテゴリ順と矛盾しない', () => {
    CONVERSATION_PHRASES.forEach((p, i) => expect(p.priority).toBe(i + 1));
    const catIndex = CONVERSATION_PHRASES.map((p) => CONVERSATION_CATEGORY_ORDER.indexOf(p.category));
    expect(catIndex.every((c) => c >= 0)).toBe(true);
    for (let i = 1; i < catIndex.length; i++) {
      expect(catIndex[i]).toBeGreaterThanOrEqual(catIndex[i - 1]);
    }
  });

  it('全カテゴリに訪日客→スタッフの文が 1 つ以上ある（空のカテゴリを出さない）', () => {
    for (const cat of CONVERSATION_CATEGORY_ORDER) {
      expect(
        CONVERSATION_PHRASES.some((p) => p.category === cat && p.direction === 'visitor-to-staff')
      ).toBe(true);
    }
  });
});

describe('会話カードの画面文言', () => {
  const keys = Object.keys(CONVERSATION_UI_TEXT.en);

  it('カテゴリ名が全カテゴリ分ある', () => {
    for (const cat of CONVERSATION_CATEGORY_ORDER) {
      expect(keys).toContain(`category.${cat}`);
    }
  });

  for (const lang of LANGUAGE_CODES) {
    it(`${lang} に全キーがあり空でない`, () => {
      const table = (CONVERSATION_UI_TEXT as Record<string, Record<string, string>>)[lang];
      expect(table).toBeDefined();
      expect(Object.keys(table).sort()).toEqual([...keys].sort());
      for (const k of keys) expect(table[k].trim().length).toBeGreaterThan(0);
    });
  }
});
