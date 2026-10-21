import { resolveLanguageParam } from '@/i18n/detectLanguage';
import { isPrefectureCode } from '@/lib/prefectures';
import type { SupportedLanguage } from '@/i18n/types';

/**
 * URL で表示言語と地域を指定する（`?lang=` / `?pref=`）。
 *
 * 用途: 宿の QR は地域だけを固定し、言語は利用者のブラウザから判定させる。
 * 英語サイトからのリンクなどは言語も固定する（docs/dev/touchpoints-2026.md §3.3）。
 *
 * **ここから返る値はすべて許可リストを通ったもの。** URL の文字列そのものを
 * 画面・`<html lang>`・API のクエリに流さない。無効値は null（＝無視して従来の判定へ）。
 *
 * 同じキーが重複した場合（`?lang=en&lang=ko`）は**先頭の値だけ**を見る。
 * 先頭が無効なら後ろの値は拾わない（どの値が効いたかを利用者が推測できなくなるため）。
 */

export const LANG_PARAM = 'lang';
export const PREF_PARAM = 'pref';

/** `location.search` 形式の文字列から `?lang=` を対応言語として読む */
export function readLangParam(search: string): SupportedLanguage | null {
  return resolveLanguageParam(new URLSearchParams(search).get(LANG_PARAM));
}

/** `location.search` 形式の文字列から `?pref=` を都道府県コード（6 桁の文字列）として読む */
export function readPrefParam(search: string): string | null {
  const raw = new URLSearchParams(search).get(PREF_PARAM);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return isPrefectureCode(trimmed) ? trimmed : null;
}

/**
 * `key` だけを `value` に置き換えた URL（パス + クエリ + hash）を返す。
 * 他のクエリと hash は残す。`key` が重複していた場合は 1 つにまとめる。
 */
export function withQueryParam(
  pathname: string,
  search: string,
  hash: string,
  key: string,
  value: string
): string {
  const params = new URLSearchParams(search);
  params.set(key, value);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

/**
 * 現在の URL の `key` を書き換える（履歴は増やさない）。
 *
 * 第 1 引数は null にする（Next.js の App Router が `history.replaceState` を
 * 差し替えており、null なら内部の履歴状態を引き継いでルーターと同期する。
 * 自前で `history.state` を渡すと同期が外れる）。
 */
export function replaceQueryParam(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  const next = withQueryParam(pathname, search, hash, key, value);
  if (next === `${pathname}${search}${hash}`) return;
  window.history.replaceState(null, '', next);
}
