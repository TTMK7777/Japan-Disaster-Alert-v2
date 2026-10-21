import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ogMetadataJson from '@/i18n/ogMetadata.json';

/**
 * layout の generateMetadata（本番経路）。middleware が渡す x-share-lang と
 * NEXT_PUBLIC_SITE_URL から共有用メタデータを作り、既存の title・description・manifest は保つ。
 */

const requestHeaders = new Headers();
vi.mock('next/headers', () => ({
  headers: async () => requestHeaders,
}));
vi.mock('@/components/ServiceWorkerRegistration', () => ({ default: () => null }));

const { generateMetadata } = await import('../layout');

const SITE = 'https://disaster.example.test';
const json = ogMetadataJson as Record<string, { title: string; description: string }>;
type Og = { title?: unknown; description?: unknown; locale?: unknown; images?: unknown };

describe('layout generateMetadata', () => {
  beforeEach(() => {
    for (const key of [...requestHeaders.keys()]) requestHeaders.delete(key);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('x-share-lang の言語と NEXT_PUBLIC_SITE_URL から作る', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE);
    requestHeaders.set('x-share-lang', 'th');
    const meta = await generateMetadata();
    const og = meta.openGraph as Og;
    expect(og.title).toBe(json.th.title);
    expect(og.description).toBe(json.th.description);
    expect(og.locale).toBe('th_TH');
    expect(meta.metadataBase?.href).toBe(`${SITE}/`);
    expect(og.images).toBeDefined();
  });

  it('ヘッダーが無ければ英語、環境変数が無ければ metadataBase と画像を出さない', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    const meta = await generateMetadata();
    const og = meta.openGraph as Og;
    expect(og.title).toBe(json.en.title);
    expect(meta.metadataBase).toBeUndefined();
    expect(og.images).toBeUndefined();
  });

  it('middleware を通らずに来た不正な x-share-lang も許可リストで弾いて英語にする', async () => {
    requestHeaders.set('x-share-lang', '<script>');
    const meta = await generateMetadata();
    expect((meta.openGraph as Og).title).toBe(json.en.title);
  });

  it('既存の title・description・manifest・appleWebApp を保つ', async () => {
    requestHeaders.set('x-share-lang', 'ko');
    const meta = await generateMetadata();
    expect(meta.title).toBe('災害対応AI - Disaster Response AI');
    expect(meta.description).toBe('多言語対応の災害情報提供システム / Multilingual Disaster Information System');
    expect(meta.manifest).toBe('/manifest.json');
    expect(meta.appleWebApp).toEqual({ capable: true, statusBarStyle: 'black-translucent', title: '災害対応AI' });
    expect(meta.formatDetection).toEqual({ telephone: true });
  });
});
