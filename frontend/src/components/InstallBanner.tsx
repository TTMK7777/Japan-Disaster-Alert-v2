'use client';

import { useState, useEffect } from 'react';
import { getTranslation } from '@/i18n/translations';

interface InstallBannerProps {
  language: string;
}

const DISMISS_KEY = 'install-banner-dismissed';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export default function InstallBanner({ language }: InstallBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Check if already dismissed within 30 days
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < DISMISS_DURATION_MS) {
        return;
      }
    }

    // iOS detection: not standalone and is iOS device
    const ios =
      !('standalone' in window.navigator && (window.navigator as any).standalone) &&
      /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (ios) {
      setIsIOS(true);
      setShowBanner(true);
      return;
    }

    // Android / Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowBanner(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  if (!showBanner) return null;

  const t = (key: string) => getTranslation(language, key);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg"
      role="banner"
      aria-label={t('install.title')}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{t('install.title')}</p>
        {isIOS && (
          <p className="text-xs opacity-90 mt-0.5">{t('install.iosGuide')}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!isIOS && deferredPrompt && (
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 bg-white text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600"
          >
            {t('install.install')}
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="px-3 py-1.5 border border-white/50 rounded-lg text-sm hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600"
          aria-label={t('install.dismiss')}
        >
          {t('install.dismiss')}
        </button>
      </div>
    </div>
  );
}
