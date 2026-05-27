import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * HIGH-1 修正: nonce ベース CSP ミドルウェア (Edge Runtime 互換)
 *
 * - リクエストごとに Web Crypto API で nonce を生成 (Edge Runtime 対応)
 * - CSP ヘッダーに 'nonce-<value>' を付与し 'unsafe-inline' を除去
 * - nonce 値を x-nonce リクエストヘッダー経由でページコンポーネントへ伝達
 * - HSTS は本番環境のみ付与 (開発/プロキシ構成での意図しない接続障害を回避)
 */
function generateNonce(): string {
  // Web Crypto API は Edge Runtime / Node.js 双方で利用可能
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  // Edge Runtime 互換の base64 化 (Buffer は使えない)
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const isProduction = process.env.NODE_ENV === 'production';

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",  // CSS-in-JS / Tailwind インライン style は許容
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.p2pquake.net https://www.jma.go.jp",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  // HSTS は本番環境 (HTTPS 配信) のみ付与
  if (isProduction) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  return response;
}

export const config = {
  matcher: [
    // _next/static, _next/image, favicon.ico などの静的ファイルを除く全ルート
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
