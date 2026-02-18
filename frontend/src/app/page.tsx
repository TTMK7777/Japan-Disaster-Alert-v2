'use client';

import { useState, useEffect, useCallback, useMemo, Component, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import LanguageSelector from '@/components/LanguageSelector';
import EarthquakeList from '@/components/EarthquakeList';
import EmergencyAlert from '@/components/EmergencyAlert';
import WarningBanner from '@/components/WarningBanner';
import EmergencyContacts from '@/components/EmergencyContacts';
import { EarthquakeIcon, ShelterIcon } from '@/components/icons/DisasterIcons';
import { translations, errorMessages, boundaryErrorMessages } from '@/i18n/translations';
import type { SupportedLanguage } from '@/i18n/types';

// Error Boundary コンポーネント
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  language: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const msg = boundaryErrorMessages[this.props.language] || boundaryErrorMessages.en;

      return (
        this.props.fallback || (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center" role="alert">
            <div className="text-red-600 text-4xl mb-2" aria-hidden="true">⚠️</div>
            <h3 className="text-lg font-bold text-red-800 mb-2">{msg.title}</h3>
            <p className="text-red-600 mb-4">{msg.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              {msg.retry}
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// Leafletはクライアントサイドのみで動作するため、SSRを無効化
const EarthquakeMap = dynamic(() => import('@/components/EarthquakeMap'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center h-64 bg-gray-100 rounded-lg">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-disaster-blue"></div>
    </div>
  ),
});

const ShelterMap = dynamic(() => import('@/components/ShelterMap'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center h-64 bg-gray-100 rounded-lg">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-disaster-blue"></div>
    </div>
  ),
});

import type { Earthquake } from '@/types/earthquake';
import { API_BASE_URL } from '@/config/api';

type TabType = 'earthquake' | 'warning' | 'emergency' | 'shelter';
type EarthquakeViewType = 'list' | 'map';

// タブアイコンコンポーネント
function TabIcon({ tab, active }: { tab: TabType; active: boolean }) {
  const size = 20;
  const color = active ? '#2563eb' : '#6B7280';

  switch (tab) {
    case 'earthquake':
      return <EarthquakeIcon size={size} className={active ? '' : 'opacity-60'} />;
    case 'warning':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
        </svg>
      );
    case 'emergency':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
        </svg>
      );
    case 'shelter':
      return <ShelterIcon size={size} className={active ? '' : 'opacity-60'} />;
  }
}

// エラー状態の型定義
interface ApiError {
  message: string;
  retryable: boolean;
}

export default function Home() {
  const [language, setLanguage] = useState<SupportedLanguage>('ja');
  const [activeTab, setActiveTab] = useState<TabType>('earthquake');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [earthquakeView, setEarthquakeView] = useState<EarthquakeViewType>('list');
  const [mounted, setMounted] = useState(false);
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([]);
  const [earthquakeLoading, setEarthquakeLoading] = useState(true);
  const [earthquakeError, setEarthquakeError] = useState<ApiError | null>(null);

  const t = useCallback(
    (key: keyof typeof translations.ja) => translations[language]?.[key] || translations.ja[key],
    [language]
  );

  // エラーメッセージ取得
  const getErrorMessage = useCallback(
    (key: keyof typeof errorMessages) => errorMessages[key][language] || errorMessages[key].en,
    [language]
  );

  // 地震データの取得
  const fetchEarthquakes = useCallback(async () => {
    try {
      setEarthquakeLoading(true);
      setEarthquakeError(null);
      const response = await fetch(`${API_BASE_URL}/api/v1/earthquakes?lang=${language}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setEarthquakes(data);
      } else {
        throw new Error('Server error');
      }
    } catch (err) {
      console.error('Failed to fetch earthquakes:', err);
      const isNetworkError = err instanceof TypeError && err.message.includes('fetch');
      setEarthquakeError({
        message: isNetworkError ? getErrorMessage('networkError') : getErrorMessage('serverError'),
        retryable: true,
      });
    } finally {
      setEarthquakeLoading(false);
    }
  }, [language, getErrorMessage]);

  useEffect(() => {
    fetchEarthquakes();
  }, [fetchEarthquakes, lastUpdate]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    // クライアントサイドでのみ実行
    setMounted(true);
    setLastUpdate(new Date());
    // マウント後に地図表示をデフォルトに
    setEarthquakeView('map');

    // 30秒ごとにデータを更新
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* 緊急警報オーバーレイ */}
      <EmergencyAlert language={language} />

      {/* ヘッダー */}
      <header className="bg-disaster-blue text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <EarthquakeIcon size={32} />
            <div>
              <h1 className="text-xl md:text-2xl font-bold">{t('title')}</h1>
              <p className="text-xs md:text-sm opacity-80">{t('subtitle')}</p>
            </div>
          </div>
          <LanguageSelector currentLanguage={language} onLanguageChange={(lang: string) => setLanguage(lang as SupportedLanguage)} />
        </div>
      </header>

      {/* タブナビゲーション（アイコン付き・アクセシビリティ強化） */}
      <nav className="bg-white border-b sticky top-[72px] z-30 shadow-sm" aria-label={language === 'ja' ? 'メインナビゲーション' : 'Main navigation'}>
        <div className="max-w-4xl mx-auto flex" role="tablist" aria-label={language === 'ja' ? '情報カテゴリ' : 'Information categories'}>
          {(['earthquake', 'warning', 'emergency', 'shelter'] as TabType[]).map((tab) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-2 md:px-4 text-center font-medium transition-colors flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 focus:outline-none focus:ring-2 focus:ring-disaster-blue focus:ring-inset ${
                activeTab === tab
                  ? 'text-disaster-blue border-b-2 border-disaster-blue bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              aria-selected={activeTab === tab}
              aria-controls={`tabpanel-${tab}`}
              role="tab"
              tabIndex={activeTab === tab ? 0 : -1}
            >
              <TabIcon tab={tab} active={activeTab === tab} />
              <span className="text-xs md:text-sm">{t(tab)}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* メインコンテンツ */}
      <div className="max-w-4xl mx-auto p-4">
        {/* 最終更新時刻 */}
        <div className="text-right text-sm text-gray-500 mb-4 flex items-center justify-end gap-2" suppressHydrationWarning>
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span suppressHydrationWarning>
            {t('lastUpdate')}: {mounted && lastUpdate ? lastUpdate.toLocaleTimeString(language === 'ja' ? 'ja-JP' : 'en-US') : '--:--:--'}
          </span>
        </div>

        {/* タブコンテンツ（アクセシビリティ強化） */}
        <ErrorBoundary language={language}>
          {activeTab === 'earthquake' && (
            <div
              id="tabpanel-earthquake"
              role="tabpanel"
              aria-labelledby="tab-earthquake"
              className="space-y-4"
              tabIndex={0}
            >
              {/* リスト/地図切り替えボタン */}
              <div className="flex justify-end" role="group" aria-label={language === 'ja' ? '表示切替' : 'View toggle'}>
                <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setEarthquakeView('list')}
                    className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-disaster-blue focus:ring-inset ${
                      earthquakeView === 'list'
                        ? 'bg-disaster-blue text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    aria-pressed={earthquakeView === 'list'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
                    </svg>
                    {t('listView')}
                  </button>
                  <button
                    onClick={() => setEarthquakeView('map')}
                    className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-disaster-blue focus:ring-inset ${
                      earthquakeView === 'map'
                        ? 'bg-disaster-blue text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    aria-pressed={earthquakeView === 'map'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
                    </svg>
                    {t('mapView')}
                  </button>
                </div>
              </div>

              {/* エラー表示 */}
              {earthquakeError && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3" role="alert">
                  <span className="text-2xl" aria-hidden="true">⚠️</span>
                  <div className="flex-1">
                    <p className="text-amber-800 font-medium">{earthquakeError.message}</p>
                  </div>
                  {earthquakeError.retryable && (
                    <button
                      onClick={fetchEarthquakes}
                      className="px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                    >
                      {getErrorMessage('retry')}
                    </button>
                  )}
                </div>
              )}

              {/* リスト表示 */}
              {earthquakeView === 'list' && (
                <EarthquakeList
                  language={language}
                  earthquakes={earthquakes}
                  loading={earthquakeLoading}
                  error={earthquakeError}
                  onRetry={fetchEarthquakes}
                />
              )}

              {/* 地図表示 */}
              {earthquakeView === 'map' &&
                (earthquakeLoading ? (
                  <div className="flex justify-center items-center h-64 bg-white rounded-lg shadow" role="status" aria-label={t('loading')}>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-disaster-blue" aria-hidden="true"></div>
                    <span className="sr-only">{t('loading')}</span>
                  </div>
                ) : (
                  <EarthquakeMap earthquakes={earthquakes} language={language} />
                ))}
            </div>
          )}

          {activeTab === 'warning' && (
            <div id="tabpanel-warning" role="tabpanel" aria-labelledby="tab-warning" tabIndex={0}>
              <WarningBanner language={language} />
            </div>
          )}

          {activeTab === 'emergency' && (
            <div id="tabpanel-emergency" role="tabpanel" aria-labelledby="tab-emergency" tabIndex={0}>
              <EmergencyContacts language={language} />
            </div>
          )}

          {activeTab === 'shelter' && (
            <div id="tabpanel-shelter" role="tabpanel" aria-labelledby="tab-shelter" tabIndex={0}>
              <ShelterMap language={language} />
            </div>
          )}
        </ErrorBoundary>
      </div>

      {/* フッター */}
      <footer className="bg-gray-100 border-t mt-8 py-4">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-600">
          <p>{t('dataSource')}</p>
          <p className="mt-1">{t('disclaimer')}</p>
        </div>
      </footer>
    </main>
  );
}

