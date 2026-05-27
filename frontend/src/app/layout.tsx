import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: '災害対応AI - Disaster Response AI',
  description: '多言語対応の災害情報提供システム / Multilingual Disaster Information System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '災害対応AI',
  },
  formatDetection: {
    telephone: true,
  },
  openGraph: {
    title: '災害対応AI - Japan Disaster Alert',
    description: '16言語対応のリアルタイム災害情報システム',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)', color: '#1e3a5f' },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // HIGH-1 修正: ミドルウェアが生成した nonce を受け取り script タグに付与
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? '';

  // HIGH-1: dangerouslySetInnerHTML の代わりに nonce 付き script タグを使用
  // これにより 'unsafe-inline' なしで CSP を適用できる
  const themeScript = `(function(){var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');})();`;

  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="min-h-dvh bg-gray-50 dark:bg-gray-900 dark:text-gray-100 transition-colors" suppressHydrationWarning>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:text-blue-600 focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg">Skip to content</a>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
