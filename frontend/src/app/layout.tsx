import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: '災害対応AI - Disaster Response AI',
  description: '多言語対応の災害情報提供システム / Multilingual Disaster Information System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
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
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var theme = localStorage.getItem('theme') || 'system';
              var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              if (isDark) document.documentElement.classList.add('dark');
            })();
          `,
        }} />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-gray-100 transition-colors" suppressHydrationWarning>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
