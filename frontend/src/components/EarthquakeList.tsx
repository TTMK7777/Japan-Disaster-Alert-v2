'use client';

import type { Earthquake } from '@/types/earthquake';

// page.tsx の ApiError と互換の型
interface ApiError {
  message: string;
  retryable: boolean;
}

interface EarthquakeListProps {
  language: string;
  earthquakes: Earthquake[];
  loading: boolean;
  error: ApiError | null;
  onRetry?: () => void;
}

// 震度に応じた色クラスを返す
function getIntensityClass(intensity: string): string {
  const intensityMap: Record<string, string> = {
    '1': 'intensity-1',
    '2': 'intensity-2',
    '3': 'intensity-3',
    '4': 'intensity-4',
    '5弱': 'intensity-5-lower',
    '5強': 'intensity-5-upper',
    '6弱': 'intensity-6-lower',
    '6強': 'intensity-6-upper',
    '7': 'intensity-7',
  };
  return intensityMap[intensity] || 'bg-gray-200';
}

export default function EarthquakeList({ language, earthquakes, loading, error, onRetry }: EarthquakeListProps) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-disaster-blue"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3" role="alert">
        <span className="text-2xl" aria-hidden="true">&#x26A0;&#xFE0F;</span>
        <div className="flex-1">
          <p className="text-amber-800 font-medium">{error.message}</p>
        </div>
        {error.retryable && onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            {language === 'ja' ? '再試行' : 'Retry'}
          </button>
        )}
      </div>
    );
  }

  if (earthquakes.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
        {language === 'ja' ? '地震情報はありません' : 'No earthquake data'}
      </div>
    );
  }

  // 表示用のテキストを取得（翻訳があれば翻訳版を表示）
  const getDisplayLocation = (eq: Earthquake) => eq.location_translated || eq.location;
  const getDisplayMessage = (eq: Earthquake) => eq.message_translated || eq.message;
  const getDisplayTsunami = (eq: Earthquake) => eq.tsunami_warning_translated || eq.tsunami_warning;

  // 津波警報の判定（日本語での判定を使用）
  const hasTsunamiRisk = (eq: Earthquake) => eq.tsunami_warning !== 'なし' && eq.tsunami_warning !== 'None';

  return (
    <div className="space-y-4">
      {earthquakes.map((eq) => (
        <div key={eq.id} className="bg-white rounded-lg shadow overflow-hidden">
          {/* ヘッダー（震度表示） */}
          <div className={`${getIntensityClass(eq.max_intensity)} px-4 py-2 flex justify-between items-center`}>
            <span className="font-bold text-lg">
              {language === 'ja' ? '震度' : 'Int.'} {eq.max_intensity}
            </span>
            <span className="text-sm opacity-80">
              M{eq.magnitude}
            </span>
          </div>

          {/* 詳細情報 */}
          <div className="p-4">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-lg">{getDisplayLocation(eq)}</h3>
              <span className="text-sm text-gray-500">{eq.time}</span>
            </div>

            <p className="text-gray-600 text-sm mb-3">{getDisplayMessage(eq)}</p>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-gray-50 rounded p-2">
                <div className="text-gray-500">{language === 'ja' ? '深さ' : 'Depth'}</div>
                <div className="font-medium">{eq.depth}km</div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="text-gray-500">{language === 'ja' ? '規模' : 'Mag.'}</div>
                <div className="font-medium">M{eq.magnitude}</div>
              </div>
              <div className={`rounded p-2 ${hasTsunamiRisk(eq) ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className="text-gray-500">{language === 'ja' ? '津波' : 'Tsunami'}</div>
                <div className={`font-medium ${hasTsunamiRisk(eq) ? 'text-red-600' : 'text-green-600'}`}>
                  {getDisplayTsunami(eq)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
