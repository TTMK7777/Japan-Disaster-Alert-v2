/** @type {import('next').NextConfig} */
// HIGH-1 修正: CSP は middleware.ts で nonce ベースに移行
// 'unsafe-inline' を script-src から除去し XSS 防護を有効化
// セキュリティヘッダーはミドルウェアで付与するため headers() は不要
const nextConfig = {
  reactStrictMode: true,
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
