import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Metadata } from 'next';
import { LANGUAGES } from '@/i18n/translations';
import ogMetadataJson from '@/i18n/ogMetadata.json';
import { OG_LOCALES } from '@/i18n/ogMetadata';
import { OG_IMAGE, buildShareMetadata, resolveSiteUrl } from '../shareMetadata';

/**
 * SNS 共有時の OGP。訪日客が友人に送ったリンクで、相手の言語の説明が出ること。
 *
 * 期待値は納品データ（ogMetadata.json ＝ CDX の metadata.json をそのまま置いたもの）から
 * 直接引く。実装側の OG_TEXT を期待値にするとマッピングの取り違えを検出できないため。
 */

const SITE = 'https://disaster.example.test';
const json = ogMetadataJson as Record<string, { title: string; description: string }>;

type OgLike = {
  title?: unknown;
  description?: unknown;
  locale?: unknown;
  type?: unknown;
  images?: unknown;
};
type TwitterLike = { card?: unknown; title?: unknown; description?: unknown; images?: unknown };

function og(meta: Metadata): OgLike {
  return (meta.openGraph ?? {}) as OgLike;
}
function tw(meta: Metadata): TwitterLike {
  return (meta.twitter ?? {}) as TwitterLike;
}

describe('ogMetadata.json（納品データ）', () => {
  it('対応 16 言語とキーが過不足なく一致する', () => {
    expect(Object.keys(json).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
    expect(Object.keys(json)).toHaveLength(16);
  });

  it('各言語に title と description があり空でない', () => {
    for (const code of Object.keys(json)) {
      expect(json[code].title.trim(), code).not.toBe('');
      expect(json[code].description.trim(), code).not.toBe('');
    }
  });
});

describe('buildShareMetadata: 言語別の文言', () => {
  it.each(LANGUAGES.map((l) => l.code))('%s: og/twitter の title と description が納品データと一致する', (code) => {
    const meta = buildShareMetadata(code, SITE);
    expect(og(meta).title).toBe(json[code].title);
    expect(og(meta).description).toBe(json[code].description);
    expect(tw(meta).title).toBe(json[code].title);
    expect(tw(meta).description).toBe(json[code].description);
    expect(og(meta).locale).toBe(OG_LOCALES[code as keyof typeof OG_LOCALES]);
  });

  it('16 言語の og:title がすべて異なる（1 言語に潰れていない）', () => {
    const titles = LANGUAGES.map((l) => og(buildShareMetadata(l.code, SITE)).title);
    expect(new Set(titles).size).toBe(16);
  });

  it('og:locale は 言語_地域 の形式で、やさしい日本語は ja_JP', () => {
    for (const l of LANGUAGES) {
      expect(og(buildShareMetadata(l.code, SITE)).locale).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
    expect(og(buildShareMetadata('easy_ja', SITE)).locale).toBe('ja_JP');
    expect(og(buildShareMetadata('zh-TW', SITE)).locale).toBe('zh_TW');
  });

  it('twitter:card は summary_large_image、og:type は website', () => {
    const meta = buildShareMetadata('ko', SITE);
    expect(tw(meta).card).toBe('summary_large_image');
    expect(og(meta).type).toBe('website');
  });
});

describe('buildShareMetadata: 無効・未指定の lang は英語', () => {
  it.each([
    ['未指定', undefined],
    ['空文字', ''],
    ['未対応のコード', 'xx'],
    ['記号入り', '<script>'],
    ['空配列', []],
    ['先頭が無効な重複指定', ['xx', 'ko']],
  ])('%s → en', (_label, value) => {
    const meta = buildShareMetadata(value as string | string[] | undefined, SITE);
    expect(og(meta).title).toBe(json.en.title);
    expect(og(meta).description).toBe(json.en.description);
    expect(og(meta).locale).toBe('en_US');
  });

  it('重複指定は先頭の値だけを見る（URL の ?lang= 解釈と同じ）', () => {
    expect(og(buildShareMetadata(['ko', 'th'], SITE)).title).toBe(json.ko.title);
  });

  it('大文字・地域付き・書記体系付きは既存の resolveLanguageParam と同じに正規化する', () => {
    expect(og(buildShareMetadata('KO', SITE)).title).toBe(json.ko.title);
    expect(og(buildShareMetadata('th-TH', SITE)).title).toBe(json.th.title);
    expect(og(buildShareMetadata('zh-Hant', SITE)).title).toBe(json['zh-TW'].title);
    expect(og(buildShareMetadata('EASY_JA', SITE)).title).toBe(json.easy_ja.title);
  });
});

describe('og:image', () => {
  it('og:image と twitter:image は 1200×630 の /og-image.png を指す', () => {
    const meta = buildShareMetadata('en', SITE);
    expect(og(meta).images).toEqual([
      { url: OG_IMAGE.path, width: 1200, height: 630, type: 'image/png', alt: json.en.title },
    ]);
    expect(tw(meta).images).toEqual([OG_IMAGE.path]);
  });

  it('指している実ファイルが PNG で 1200×630（IHDR を読む）', () => {
    const file = path.resolve(__dirname, '../../../public', OG_IMAGE.path.replace(/^\//, ''));
    const buf = readFileSync(file);
    // PNG シグネチャ 8 バイト → IHDR チャンク（長さ 4・型 4）→ 幅 4・高さ 4
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(buf.readUInt32BE(16)).toBe(OG_IMAGE.width);
    expect(buf.readUInt32BE(20)).toBe(OG_IMAGE.height);
    expect([OG_IMAGE.width, OG_IMAGE.height]).toEqual([1200, 630]);
  });
});

describe('metadataBase（公開 URL）', () => {
  it('公開 URL があれば metadataBase にする', () => {
    const meta = buildShareMetadata('en', SITE);
    expect(meta.metadataBase?.href).toBe(`${SITE}/`);
  });

  it.each([
    ['未設定', undefined],
    ['空文字', ''],
    ['空白だけ', '   '],
    ['URL でない', 'not a url'],
    ['http(s) 以外', 'javascript:alert(1)'],
    ['ftp', 'ftp://example.test'],
  ])('%s → metadataBase も画像も出さない（localhost の URL を出さない）', (_label, raw) => {
    const meta = buildShareMetadata('ko', raw);
    expect(meta.metadataBase).toBeUndefined();
    expect(og(meta).images).toBeUndefined();
    expect(tw(meta).images).toBeUndefined();
    // 文言は言語別のまま出す
    expect(og(meta).title).toBe(json.ko.title);
  });

  it('resolveSiteUrl は前後の空白を許し、http/https だけを通す', () => {
    expect(resolveSiteUrl('  https://a.example.test  ')?.href).toBe('https://a.example.test/');
    expect(resolveSiteUrl('http://127.0.0.1:3000')?.href).toBe('http://127.0.0.1:3000/');
    expect(resolveSiteUrl('data:text/html,x')).toBeNull();
  });
});
