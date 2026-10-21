import { readLangParam } from '@/lib/urlPreferences';
import type { SupportedLanguage } from '@/i18n/types';

/**
 * middleware → layout の generateMetadata へ、共有用の言語を渡すリクエストヘッダー。
 * 値は許可リストを通した言語コードだけ（URL の生の値は渡さない）。
 */
export const SHARE_LANG_HEADER = 'x-share-lang';

/**
 * リクエストヘッダーに共有用の言語を載せる（middleware 用）。
 *
 * `?lang=` が解釈できなければヘッダーを**消す**。利用者が自分で `x-share-lang` を
 * 付けて送ってきても、その値をそのまま layout へ通さないため。
 */
export function applyShareLangHeader(requestHeaders: Headers, search: string): SupportedLanguage | null {
  const lang = readLangParam(search);
  if (lang) {
    requestHeaders.set(SHARE_LANG_HEADER, lang);
  } else {
    requestHeaders.delete(SHARE_LANG_HEADER);
  }
  return lang;
}
