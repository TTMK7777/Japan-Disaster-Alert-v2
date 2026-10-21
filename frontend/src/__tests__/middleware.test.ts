// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

/**
 * middleware の CSP 文字列を固定する（共有用 OGP のために middleware を触ったとき、
 * CSP が 1 文字も変わっていないことの保証）。nonce だけはリクエストごとに変わるので置き換えて比べる。
 *
 * テスト環境では NEXT_PUBLIC_API_URL 未設定 → API オリジンは既定の http://localhost:8000。
 */
const EXPECTED_CSP = [
  "default-src 'self'",
  "script-src 'self' 'nonce-<NONCE>'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  'connect-src \'self\' http://localhost:8000 https://cyberjapandata.gsi.go.jp',
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function run(url: string, init?: { headers?: Record<string, string> }) {
  return middleware(new NextRequest(url, init));
}

/** NextResponse.next({ request: { headers } }) で下流へ渡るリクエストヘッダーを読む */
function forwarded(res: Response, name: string): string | null {
  const overridden = (res.headers.get('x-middleware-override-headers') ?? '').split(',');
  if (!overridden.includes(name)) return null;
  return res.headers.get(`x-middleware-request-${name}`);
}

describe('middleware: CSP', () => {
  it.each(['http://127.0.0.1:3000/', 'http://127.0.0.1:3000/?lang=ko', 'http://127.0.0.1:3000/?lang=xx'])(
    '%s: CSP は nonce 以外まったく同じ',
    (url) => {
      const res = run(url);
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      const nonce = forwarded(res, 'x-nonce');
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(csp.replace(`'nonce-${nonce}'`, "'nonce-<NONCE>'")).toBe(EXPECTED_CSP);
    }
  );

  it('その他のセキュリティヘッダーも変わらない', () => {
    const res = run('http://127.0.0.1:3000/?lang=th');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=(self)');
  });
});

describe('middleware: 共有用の言語ヘッダー（x-share-lang）', () => {
  it.each([
    ['/?lang=ko', 'ko'],
    ['/?lang=th', 'th'],
    ['/?lang=zh-Hant', 'zh-TW'],
    ['/?lang=EASY_JA', 'easy_ja'],
    ['/?lang=ko&lang=th', 'ko'],
  ])('%s → %s（許可リストを通した値）', (path, expected) => {
    const res = run(`http://127.0.0.1:3000${path}`);
    expect(forwarded(res, 'x-share-lang')).toBe(expected);
  });

  it.each(['/', '/?lang=', '/?lang=xx', '/?lang=%3Cscript%3E', '/?lang=xx&lang=ko'])(
    '%s → ヘッダーを渡さない',
    (path) => {
      const res = run(`http://127.0.0.1:3000${path}`);
      expect(forwarded(res, 'x-share-lang')).toBeNull();
    }
  );

  it('利用者が自分で付けた x-share-lang は消す（?lang が無効・未指定のとき）', () => {
    const res = run('http://127.0.0.1:3000/?lang=xx', { headers: { 'x-share-lang': '<script>' } });
    expect(forwarded(res, 'x-share-lang')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-share-lang')).toBeNull();
  });

  it('利用者が付けた x-share-lang より ?lang を優先する', () => {
    const res = run('http://127.0.0.1:3000/?lang=ko', { headers: { 'x-share-lang': 'th' } });
    expect(forwarded(res, 'x-share-lang')).toBe('ko');
  });
});
