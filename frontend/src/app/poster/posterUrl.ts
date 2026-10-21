import { isPrefectureCode } from '@/lib/prefectures';
import { PREF_PARAM } from '@/lib/urlPreferences';

/**
 * 宿のポスターの QR に入れる URL を作る。
 *
 * - origin は呼び出し側が渡す（ブラウザでは `window.location.origin`）。URL を埋め込まない
 * - 地域は府県予報区コードの許可リストを通ったものだけを `?pref=` に入れる。
 *   無効・未指定なら地域を固定しない（トップ `/` だけ）
 * - **言語は入れない。** 訪日客のブラウザ言語で自動判定させる（docs/dev/touchpoints-2026.md §3.3）
 */
export function buildPosterTargetUrl(origin: string, pref: unknown): string {
  const base = `${origin}/`;
  const code = typeof pref === 'string' ? pref.trim() : null;
  if (!isPrefectureCode(code)) return base;
  const params = new URLSearchParams();
  params.set(PREF_PARAM, code);
  return `${base}?${params.toString()}`;
}
