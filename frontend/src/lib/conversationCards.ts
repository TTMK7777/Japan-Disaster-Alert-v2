import type { SupportedLanguage } from '@/i18n/types';
import {
  CONVERSATION_CATEGORY_ORDER,
  CONVERSATION_PHRASES,
  type ConversationCategory,
  type ConversationPhrase,
} from '@/data/conversationPhrases';

/**
 * 会話カードの表示ロジック（画面から切り離した純関数）。
 *
 * 表示の決まり（DIR 決定）:
 *   スタッフに見せる = 日本語（スタッフ用・大きく）→ 利用者の言語 → 英語 の 3 段。
 *   英語を必ず添えるのは、利用者の言語の誤訳を英語で補うため。
 *   同じ言語・同じ本文の行は 2 回出さない（利用者が ja / en のとき、
 *   やさしい日本語の本文が日本語と同じ「はい。」など）。
 */

export type CardLineRole = 'staff' | 'visitor' | 'english';

export interface CardLine {
  role: CardLineRole;
  lang: SupportedLanguage;
  text: string;
}

/** スタッフの返事のあとに訪日客が選べる返答（はい／いいえ／わかりません） */
export const VISITOR_ANSWER_IDS = ['C32', 'C34', 'C35'] as const;

/** 同じ言語・同じ本文の行を後ろから落とす（先に出した行を残す） */
function dedupe(lines: CardLine[]): CardLine[] {
  const seenLang = new Set<string>();
  const seenText = new Set<string>();
  const out: CardLine[] = [];
  for (const line of lines) {
    if (seenLang.has(line.lang) || seenText.has(line.text)) continue;
    seenLang.add(line.lang);
    seenText.add(line.text);
    out.push(line);
  }
  return out;
}

export function phraseById(id: string): ConversationPhrase | undefined {
  return CONVERSATION_PHRASES.find((p) => p.id === id);
}

/** 訪日客がスタッフに見せるカード: 日本語 → 利用者の言語 → 英語 */
export function visitorCardLines(phrase: ConversationPhrase, userLang: SupportedLanguage): CardLine[] {
  const staff: CardLine = { role: 'staff', lang: 'ja', text: phrase.text.ja };
  const visitor: CardLine = { role: 'visitor', lang: userLang, text: phrase.text[userLang] };
  const english: CardLine = { role: 'english', lang: 'en', text: phrase.text.en };
  // スタッフ用の日本語の行は必ず残す（重複除去で消してよいのは利用者の行と英語の行だけ）。
  // 英語は最後の行。利用者の行が英語・英語と同じ本文なら、英語の行にまとめる
  const lines = dedupe([staff, visitor]).filter(
    (l) => l.role === 'staff' || (l.lang !== 'en' && l.text !== english.text)
  );
  if (english.text !== staff.text) lines.push(english);
  return lines;
}

/**
 * スタッフが訪日客に返すカード: 大きく 訪日客の言語 → 英語。
 * スタッフが何を選んだか確かめられるよう、日本語を小さく添える（大表示と重なるなら出さない）。
 */
export function staffReplyLines(
  phrase: ConversationPhrase,
  userLang: SupportedLanguage
): { large: CardLine[]; reference: CardLine | null } {
  const large = dedupe([
    { role: 'visitor', lang: userLang, text: phrase.text[userLang] },
    { role: 'english', lang: 'en', text: phrase.text.en },
  ]);
  const ja = phrase.text.ja;
  const reference = large.some((l) => l.lang === 'ja' || l.text === ja)
    ? null
    : ({ role: 'staff', lang: 'ja', text: ja } as CardLine);
  return { large, reference };
}

/** 訪日客側のカテゴリ（命に関わる順）。訪日客→スタッフの文が無いカテゴリは出さない */
export function visitorCategories(): ConversationCategory[] {
  return CONVERSATION_CATEGORY_ORDER.filter((cat) =>
    CONVERSATION_PHRASES.some((p) => p.category === cat && p.direction === 'visitor-to-staff')
  );
}

function byPriority(a: ConversationPhrase, b: ConversationPhrase) {
  return a.priority - b.priority;
}

/** 訪日客側でカテゴリを開いたときの文（訪日客→スタッフだけ） */
export function visitorPhrasesIn(category: ConversationCategory): ConversationPhrase[] {
  return CONVERSATION_PHRASES.filter(
    (p) => p.category === category && p.direction === 'visitor-to-staff'
  ).sort(byPriority);
}

/**
 * スタッフ側の文（スタッフ→訪日客だけ）。直前に訪日客が見せた文と同じカテゴリを先頭に、
 * 残りは優先順。
 */
export function staffPhrasesFor(contextCategory: ConversationCategory | null): ConversationPhrase[] {
  const staff = CONVERSATION_PHRASES.filter((p) => p.direction === 'staff-to-visitor').sort(byPriority);
  if (!contextCategory) return staff;
  return [
    ...staff.filter((p) => p.category === contextCategory),
    ...staff.filter((p) => p.category !== contextCategory),
  ];
}
