/** @type {import('next').NextConfig} */
// HIGH-1 修正: CSP は middleware.ts で nonce ベースに移行
// 'unsafe-inline' を script-src から除去し XSS 防護を有効化
// セキュリティヘッダーはミドルウェアで付与するため headers() は不要
const nextConfig = {
  reactStrictMode: true,
  // Cloud Run 用。node_modules ごと配らずに済む最小の実行ファイル群を .next/standalone に出す
  output: 'standalone',
  // リポジトリルートにも package.json があるため、既定では monorepo と判定され
  // standalone の中身が .next/standalone/frontend/ に1段深く出る。
  // Docker のビルドコンテキスト（frontend/ 単体）では判定が変わり出力パスがズレるので、
  // 起点をこのディレクトリに固定して both で .next/standalone/server.js に揃える
  outputFileTracingRoot: __dirname,
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
