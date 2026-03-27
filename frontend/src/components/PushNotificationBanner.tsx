'use client';

import { getTranslation } from '@/i18n/translations';
import { usePushNotification } from '@/hooks/usePushNotification';

interface PushNotificationBannerProps {
  language: string;
}

export default function PushNotificationBanner({ language }: PushNotificationBannerProps) {
  const t = (key: string) => getTranslation(language, key);
  const { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe } =
    usePushNotification(language);

  // 未対応ブラウザ
  if (!isSupported) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="shrink-0 opacity-50"
          aria-hidden="true"
        >
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
        <span>{t('push.unsupported')}</span>
      </div>
    );
  }

  // 通知ブロック状態
  if (permission === 'denied') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex items-center gap-3 text-sm text-amber-600 dark:text-amber-400">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="shrink-0"
          aria-hidden="true"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
        <span>{t('push.blocked')}</span>
      </div>
    );
  }

  const handleToggle = () => {
    if (isSubscribed) {
      unsubscribe().catch(console.error);
    } else {
      subscribe().catch(console.error);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex items-center gap-4">
      {/* アイコン */}
      <div className="shrink-0 text-blue-600 dark:text-blue-400">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
      </div>

      {/* テキスト */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('push.title')}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {t('push.description')}
        </p>
      </div>

      {/* トグルスイッチ */}
      <button
        role="switch"
        aria-checked={isSubscribed}
        aria-label={isSubscribed ? t('push.disable') : t('push.enable')}
        onClick={handleToggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          isSubscribed
            ? 'bg-blue-600 dark:bg-blue-500'
            : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isSubscribed ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
