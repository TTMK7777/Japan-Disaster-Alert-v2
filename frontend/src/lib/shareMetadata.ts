import type { Metadata } from 'next';
import { resolveLanguageParam } from '@/i18n/detectLanguage';
import { OG_DEFAULT_LANGUAGE, OG_LOCALES, OG_TEXT } from '@/i18n/ogMetadata';
import type { SupportedLanguage } from '@/i18n/types';

/**
 * SNS・メッセージアプリで共有されたときのメタデータ（OGP / Twitter Card）を作る。
 *
 * 訪日客が友人にリンク（`/?lang=ko` 等）を送ったとき、受け取った側の言語で
 * アプリの説明が出るようにする。`?lang=` は既存の `resolveLanguageParam` で
 * 許可リストに通し、URL の文字列そのものはメタタグに流さない。
 */

/** 共有画像（public/ 配下）。寸法はテストで実ファイルの IHDR と突き合わせる */
export const OG_IMAGE = {
  path: '/og-image.png',
  width: 1200,
  height: 630,
  type: 'image/png',
} as const;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * 公開 URL（`NEXT_PUBLIC_SITE_URL`）を metadataBase 用の URL にする。
 * 未設定・空・http(s) 以外・URL として読めない値は null（＝絶対 URL を作らない）。
 */
export function resolveSiteUrl(raw: string | null | undefined): URL | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * `?lang=` の値（Next の searchParams は重複時に配列になる）を共有用の言語にする。
 * 重複時は先頭だけを見る（`readLangParam` と同じ規則）。解釈できなければ英語。
 */
export function resolveShareLanguage(value: string | string[] | undefined): SupportedLanguage {
  const first = Array.isArray(value) ? value[0] : value;
  return resolveLanguageParam(first) ?? OG_DEFAULT_LANGUAGE;
}

/**
 * @param langParam searchParams の `lang`
 * @param siteUrlRaw 公開 URL（呼び出し側で `process.env.NEXT_PUBLIC_SITE_URL` を渡す）
 *
 * 公開 URL が無いときは og:image / twitter:image を出さない。Next は metadataBase 無しの
 * 相対画像を `http://localhost:<PORT>` に解決して警告を出すため、壊れた絶対 URL を
 * 配るより画像なしで文言だけ出す方がよい。
 */
export function buildShareMetadata(
  langParam: string | string[] | undefined,
  siteUrlRaw: string | null | undefined
): Metadata {
  const lang = resolveShareLanguage(langParam);
  const { title, description } = OG_TEXT[lang];
  const siteUrl = resolveSiteUrl(siteUrlRaw);

  const metadata: Metadata = {
    openGraph: {
      type: 'website',
      title,
      description,
      locale: OG_LOCALES[lang],
      ...(siteUrl && {
        images: [
          {
            url: OG_IMAGE.path,
            width: OG_IMAGE.width,
            height: OG_IMAGE.height,
            type: OG_IMAGE.type,
            alt: title,
          },
        ],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(siteUrl && { images: [OG_IMAGE.path] }),
    },
  };
  if (siteUrl) metadata.metadataBase = siteUrl;
  return metadata;
}
