import { isPrefectureCode } from '@/lib/prefectures';
import { PREF_PARAM } from '@/lib/urlPreferences';
import { resolveSiteUrl } from '@/lib/shareMetadata';

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

/**
 * QR の土台にする origin。公開 URL（`NEXT_PUBLIC_SITE_URL`。ビルド時に焼き込み）があればそれを優先する。
 *
 * スタッフがポスターのページを社内 LAN の URL や `localhost` で開いて印刷すると、
 * QR には**客のスマホから開けない URL** が入る。公開 URL が分かっていればそちらで作る。
 * 値の検証は OGP と同じ `resolveSiteUrl`（http(s) 以外・URL でない値は無視）。
 */
export function resolvePosterOrigin(siteUrlRaw: string | null | undefined, windowOrigin: string): string {
  return resolveSiteUrl(siteUrlRaw)?.origin ?? windowOrigin;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '0.0.0.0', '[::1]', '::1']);

/** IPv4 の私設・ループバック（10/8・172.16/12・192.168/16・127/8） */
function isPrivateIPv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * 他の端末（客のスマホ）から開けない origin か。画面上で警告するために使う（印刷には出さない）。
 * 読めない値は true（開けるか確かめられないので警告側に倒す）。
 */
export function isLocalOnlyOrigin(origin: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return true;
  }
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || isPrivateIPv4(hostname);
}
