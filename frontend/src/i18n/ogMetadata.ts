import ogMetadataJson from './ogMetadata.json';
import type { SupportedLanguage } from './types';

/**
 * SNS・メッセージアプリで共有されたときの文言（og:title / og:description）。
 *
 * 正本は `ogMetadata.json`（CDX 納品の metadata.json を**そのまま**置いたもの。
 * 文言を直すときは JSON 側を直す）。ここでは型を付けて 16 言語が揃っていることを
 * コンパイル時に保証する（1 言語でも欠けると `satisfies` で型エラーになる）。
 */
export interface OgText {
  title: string;
  description: string;
}

export const OG_TEXT = ogMetadataJson satisfies Record<SupportedLanguage, OgText>;

/**
 * 共有の既定言語。リンクに `?lang=` が無い・解釈できないときに使う。
 * 共有先は訪日客の友人である想定なので、日本語ではなく英語に寄せる。
 */
export const OG_DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * og:locale（`言語_地域` 形式）。地域は LANGUAGES の旗と揃える。
 * やさしい日本語は日本語として扱う（og:locale に表示区分の概念は無い）。
 */
export const OG_LOCALES: Record<SupportedLanguage, string> = {
  ja: 'ja_JP',
  en: 'en_US',
  zh: 'zh_CN',
  'zh-TW': 'zh_TW',
  ko: 'ko_KR',
  vi: 'vi_VN',
  th: 'th_TH',
  id: 'id_ID',
  ms: 'ms_MY',
  tl: 'tl_PH',
  ne: 'ne_NP',
  fr: 'fr_FR',
  de: 'de_DE',
  it: 'it_IT',
  es: 'es_ES',
  easy_ja: 'ja_JP',
};
