import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/i18n/translations';
import type { SupportedLanguage } from '@/i18n/types';
import { CONVERSATION_PHRASES } from '@/data/conversationPhrases';
import {
  VISITOR_ANSWER_IDS,
  phraseById,
  staffPhrasesFor,
  staffReplyLines,
  visitorCardLines,
  visitorCategories,
  visitorPhrasesIn,
} from '@/lib/conversationCards';

const ALL_LANGS = LANGUAGES.map((l) => l.code as SupportedLanguage);
const C05 = phraseById('C05')!;
const C32 = phraseById('C32')!; // 「はい。」= easy_ja と ja が同じ本文

function texts(lines: { text: string }[]) {
  return lines.map((l) => l.text);
}

describe('visitorCardLines（スタッフに見せる 3 段表示）', () => {
  it('タイ語: 日本語 → タイ語 → 英語 の 3 段', () => {
    const lines = visitorCardLines(C05, 'th');
    expect(lines.map((l) => [l.role, l.lang])).toEqual([
      ['staff', 'ja'],
      ['visitor', 'th'],
      ['english', 'en'],
    ]);
    expect(texts(lines)).toEqual([C05.text.ja, C05.text.th, C05.text.en]);
  });

  it('利用者が日本語なら 日本語＋英語 の 2 段（日本語を 2 回出さない）', () => {
    const lines = visitorCardLines(C05, 'ja');
    expect(lines.map((l) => l.lang)).toEqual(['ja', 'en']);
  });

  it('利用者が英語なら 日本語＋英語 の 2 段（英語を 2 回出さない）', () => {
    const lines = visitorCardLines(C05, 'en');
    expect(lines.map((l) => l.lang)).toEqual(['ja', 'en']);
  });

  it('やさしい日本語: 本文が日本語と違えば 3 段', () => {
    const lines = visitorCardLines(C05, 'easy_ja');
    expect(lines.map((l) => l.lang)).toEqual(['ja', 'easy_ja', 'en']);
  });

  it('やさしい日本語: 本文が日本語と同じ文（はい。）は 2 段', () => {
    expect(C32.text.easy_ja).toBe(C32.text.ja);
    expect(visitorCardLines(C32, 'easy_ja').map((l) => l.lang)).toEqual(['ja', 'en']);
  });

  it('全 40 文 × 16 言語で、同じ言語・同じ本文の行が 2 回出ない。先頭は必ず日本語、最後は必ず英語', () => {
    for (const p of CONVERSATION_PHRASES) {
      for (const lang of ALL_LANGS) {
        const lines = visitorCardLines(p, lang);
        expect(new Set(lines.map((l) => l.lang)).size).toBe(lines.length);
        expect(new Set(texts(lines)).size).toBe(lines.length);
        expect(lines[0]).toMatchObject({ role: 'staff', lang: 'ja' });
        expect(lines[lines.length - 1]).toMatchObject({ role: 'english', lang: 'en' });
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines.length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('staffReplyLines（スタッフが返す: 訪日客の言語＋英語）', () => {
  const C06 = phraseById('C06')!;

  it('タイ語: 大きく タイ語 → 英語、日本語はスタッフの確認用に小さく', () => {
    const { large, reference } = staffReplyLines(C06, 'th');
    expect(large.map((l) => l.lang)).toEqual(['th', 'en']);
    expect(reference).toMatchObject({ lang: 'ja', text: C06.text.ja });
  });

  it('英語: 英語 1 段（2 回出さない）＋日本語の確認', () => {
    const { large, reference } = staffReplyLines(C06, 'en');
    expect(large.map((l) => l.lang)).toEqual(['en']);
    expect(reference?.lang).toBe('ja');
  });

  it('利用者の言語の本文が英語と同じ（it の C34「No.」）なら 1 段', () => {
    const C34 = phraseById('C34')!;
    expect(C34.text.it).toBe(C34.text.en);
    expect(texts(staffReplyLines(C34, 'it').large)).toEqual(['No.']);
    expect(texts(visitorCardLines(C34, 'it'))).toEqual([C34.text.ja, 'No.']);
  });

  it('日本語: 日本語＋英語、確認用の日本語は重ねない', () => {
    const { large, reference } = staffReplyLines(C06, 'ja');
    expect(large.map((l) => l.lang)).toEqual(['ja', 'en']);
    expect(reference).toBeNull();
  });

  it('全 40 文 × 16 言語で、大表示と確認行を合わせても同じ本文が 2 回出ない', () => {
    for (const p of CONVERSATION_PHRASES) {
      for (const lang of ALL_LANGS) {
        const { large, reference } = staffReplyLines(p, lang);
        const all = reference ? [...large, reference] : large;
        expect(new Set(texts(all)).size).toBe(all.length);
        // 英語の本文は必ず大きく出る（it / es の C34「No.」は利用者の言語の行と同じ本文なので 1 行にまとまる）
        expect(large.some((l) => l.text === p.text.en)).toBe(true);
      }
    }
  });
});

describe('並びと方向の分離', () => {
  it('訪日客側のカテゴリは命に関わる順で、先頭は緊急', () => {
    expect(visitorCategories().slice(0, 5)).toEqual([
      'emergency',
      'injury',
      'medication',
      'allergy',
      'family',
    ]);
  });

  it('訪日客側の文一覧にスタッフ→訪日客の文は出ない（全カテゴリ）', () => {
    for (const cat of visitorCategories()) {
      const list = visitorPhrasesIn(cat);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((p) => p.direction === 'visitor-to-staff')).toBe(true);
      expect(list.every((p) => p.category === cat)).toBe(true);
    }
    expect(visitorPhrasesIn('emergency').map((p) => p.id)).toEqual(['C01', 'C02', 'C03']);
  });

  it('スタッフ側の一覧はスタッフ→訪日客の文だけで、相手の文と同じカテゴリが先頭', () => {
    const list = staffPhrasesFor('injury');
    expect(list.every((p) => p.direction === 'staff-to-visitor')).toBe(true);
    expect(list.slice(0, 2).map((p) => p.id)).toEqual(['C06', 'C09']);
    expect(list).toHaveLength(14);
  });

  it('相手の文が無いときは優先順のまま', () => {
    expect(staffPhrasesFor(null).map((p) => p.priority)).toEqual(
      [...staffPhrasesFor(null)].map((p) => p.priority).sort((a, b) => a - b)
    );
  });

  it('訪日客の返答は はい／いいえ／わかりません（いずれも訪日客→スタッフ）', () => {
    expect(VISITOR_ANSWER_IDS).toEqual(['C32', 'C34', 'C35']);
    for (const id of VISITOR_ANSWER_IDS) {
      expect(phraseById(id)?.direction).toBe('visitor-to-staff');
    }
  });
});
