import { LANGUAGES } from './translations';
import type { SupportedLanguage } from './types';

/**
 * ブラウザの言語設定から表示言語を推定する。
 *
 * 訪日客は災害発生後に初めてこのアプリを開くため、16言語のリストから
 * 自力で自国語を探させるのは現実的でない。初回表示から母国語で出すための判定。
 *
 * `easy_ja`（やさしい日本語）は自動選択の対象外。ブラウザ設定から
 * 「やさしい日本語を必要としている」ことは判別できないため、明示選択に委ねる。
 */

// 自動選択の候補（easy_ja を除く）。小文字タグ → 正式なコード
const CANONICAL: Map<string, SupportedLanguage> = new Map(
  LANGUAGES.filter((l) => l.code !== 'easy_ja').map((l) => [
    l.code.toLowerCase(),
    l.code as SupportedLanguage,
  ])
);

// 同一言語の別コード。ブラウザやOSによって異なる表記で来る
const ALIASES: Record<string, SupportedLanguage> = {
  fil: 'tl', // Filipino は BCP47 では fil、本アプリのコードは tl
  in: 'id', // インドネシア語の旧 ISO 639-1 コード
};

// 繁体字として扱う書記体系・地域のサブタグ
const TRADITIONAL_CHINESE_SUBTAGS = new Set(['hant', 'tw', 'hk', 'mo']);

const FALLBACK: SupportedLanguage = 'en';

function resolveChinese(subtags: string[]): SupportedLanguage {
  return subtags.some((s) => TRADITIONAL_CHINESE_SUBTAGS.has(s)) ? 'zh-TW' : 'zh';
}

function resolveTag(tag: string): SupportedLanguage | null {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return null;

  const parts = normalized.split('-').filter(Boolean);
  const primary = parts[0];
  if (!primary) return null;

  // 中国語は書記体系・地域で繁体/簡体に振り分ける
  if (primary === 'zh') return resolveChinese(parts.slice(1));

  // 完全一致（zh-TW のような地域付きコードを拾う）
  const exact = CANONICAL.get(normalized);
  if (exact) return exact;

  // 別コードの吸収
  const aliased = ALIASES[primary];
  if (aliased && CANONICAL.has(aliased.toLowerCase())) return aliased;

  // 言語コードのみで一致（en-US → en）
  return CANONICAL.get(primary) ?? null;
}

/**
 * 優先度順の言語タグ配列から、対応言語を1つ選ぶ。
 * 対応言語が1つも見つからない場合は `en` を返す（日本語ではなく英語に寄せる）。
 *
 * @param candidates `navigator.languages` 等の BCP47 言語タグ（優先度順）
 */
export function detectLanguage(candidates?: readonly string[] | null): SupportedLanguage {
  if (!candidates) return FALLBACK;

  for (const tag of candidates) {
    if (typeof tag !== 'string') continue;
    const resolved = resolveTag(tag);
    if (resolved) return resolved;
  }
  return FALLBACK;
}

/**
 * URL の `?lang=` のような、利用者（またはリンクの作り手）が明示した 1 つの値を
 * 対応言語に解釈する。解釈できなければ null（呼び出し側は従来の判定へ落とす）。
 *
 * 正規化はブラウザ判定（`resolveTag`）と同じものを使う（大文字小文字・`en-US`・`zh-Hant`）。
 * ただし `easy_ja` は明示指定なので受け付ける（自動判定の対象外にしている理由は
 * 「ブラウザ設定からは必要性を判別できない」ためで、明示されていればその理由は無い）。
 */
export function resolveLanguageParam(value: string | null | undefined): SupportedLanguage | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const explicit = LANGUAGES.find((l) => l.code.toLowerCase() === normalized);
  if (explicit) return explicit.code as SupportedLanguage;
  return resolveTag(value);
}

/** 対応言語のコードそのものか（大文字小文字・地域付きは認めない厳密な判定） */
export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && LANGUAGES.some((l) => l.code === value);
}

/**
 * 実行中のブラウザから言語タグを優先度順に取得する。
 * SSR や navigator が無い環境では空配列を返す。
 */
export function getBrowserLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  const list = Array.isArray(navigator.languages) ? navigator.languages : [];
  const single = navigator.language ? [navigator.language] : [];
  return [...list, ...single];
}

/**
 * 初期表示言語を決める。
 *
 * 優先順位:
 *   1. 利用者が明示選択して保存した言語（`stored`）
 *   2. ブラウザの言語設定からの推定
 *
 * `stored` に未対応の値が入っていた場合は無視してブラウザ推定に落とす
 * （古いバージョンの保存値や手動改変への防御）。
 *
 * @param stored localStorage に保存された言語コード（未保存なら null）
 * @param browserLanguages `getBrowserLanguages()` の結果
 */
export function resolveInitialLanguage(
  stored: string | null | undefined,
  browserLanguages?: readonly string[] | null
): SupportedLanguage {
  if (stored && LANGUAGES.some((l) => l.code === stored)) {
    return stored as SupportedLanguage;
  }
  return detectLanguage(browserLanguages);
}
