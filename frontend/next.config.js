/** @type {import('next').NextConfig} */
// HIGH-2 修正: CSP およびその他セキュリティヘッダーを全レスポンスに付与
// XSS 緩和の最後の砦 (HIGH-3 の localStorage トークン窃取面も縮小)
// connect-src は本プロジェクトが利用する外部 API のみ列挙
const CSP = [
  "default-src 'self'",
  // Next.js の RSC ハイドレーション用に self とインライン (CSP nonce 移行は別タスク)
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // 外部 API: バックエンド本体 + JMA + P2PQuake (実装で叩く先)
  "connect-src 'self' https://api.p2pquake.net https://www.jma.go.jp",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
