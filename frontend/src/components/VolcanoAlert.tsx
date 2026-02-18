'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/config/api';

interface Volcano {
  code: number;
  name: string;
  name_en?: string;
  latitude?: number;
  longitude?: number;
  alert_level?: number;
  alert_level_text?: string;
  is_monitored: boolean;
}

interface VolcanoWarning {
  volcano_code: number;
  volcano_name?: string;
  alert_level: number;
  alert_level_name: string;
  severity: string;
  action: string;
  issued_at: string;
  headline?: string;
}

interface VolcanoAlertProps {
  language?: string;
  showAll?: boolean;
  onVolcanoSelect?: (volcano: Volcano) => void;
}

// 多言語対応のテキスト
const translations: Record<string, Record<string, string>> = {
  ja: {
    title: '火山情報',
    monitoredVolcanoes: '常時観測火山',
    alertLevel: '噴火警戒レベル',
    noAlerts: '現在、噴火警報は発表されていません',
    loading: '読み込み中...',
    error: '情報を取得できませんでした',
    retry: '再試行',
    level1: '活火山であることに留意',
    level2: '火口周辺規制',
    level3: '入山規制',
    level4: '高齢者等避難',
    level5: '避難',
    action: '推奨される行動',
  },
  en: {
    title: 'Volcano Information',
    monitoredVolcanoes: 'Monitored Volcanoes',
    alertLevel: 'Volcanic Alert Level',
    noAlerts: 'No volcanic warnings currently in effect',
    loading: 'Loading...',
    error: 'Failed to load information',
    retry: 'Retry',
    level1: 'Potential for increased activity',
    level2: 'Do not approach the crater',
    level3: 'Do not climb the mountain',
    level4: 'Prepare to evacuate (elderly, etc.)',
    level5: 'Evacuate',
    action: 'Recommended Action',
  },
  easy_ja: {
    title: 'かざん じょうほう',
    monitoredVolcanoes: 'みている かざん',
    alertLevel: 'かざんの あんぜんレベル',
    noAlerts: 'いま、かざんの けいほうは ありません',
    loading: 'よみこみちゅう...',
    error: 'じょうほうを とれませんでした',
    retry: 'もういちど',
    level1: 'かざんです。きをつけて',
    level2: 'かこうに ちかづかないで',
    level3: 'やまに のぼらないで',
    level4: 'おとしより などは にげる じゅんび',
    level5: 'にげてください',
    action: 'やること',
  },
  zh: {
    title: '火山信息',
    monitoredVolcanoes: '常时观测火山',
    alertLevel: '火山警戒级别',
    noAlerts: '目前没有发布火山警报',
    loading: '加载中...',
    error: '无法获取信息',
    retry: '重试',
    level1: '请注意这是活火山',
    level2: '火山口周边管制',
    level3: '禁止入山',
    level4: '老年人等避难准备',
    level5: '避难',
    action: '建议行动',
  },
  ko: {
    title: '화산 정보',
    monitoredVolcanoes: '상시 관측 화산',
    alertLevel: '화산 경계 레벨',
    noAlerts: '현재 화산 경보가 발령되지 않았습니다',
    loading: '로딩 중...',
    error: '정보를 가져올 수 없습니다',
    retry: '재시도',
    level1: '활화산임을 유의',
    level2: '화구 주변 규제',
    level3: '입산 규제',
    level4: '고령자 등 대피 준비',
    level5: '대피',
    action: '권장 행동',
  },
};

export default function VolcanoAlert({
  language = 'ja',
  showAll = false,
  onVolcanoSelect,
}: VolcanoAlertProps) {
  const [volcanoes, setVolcanoes] = useState<Volcano[]>([]);
  const [warnings, setWarnings] = useState<VolcanoWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = useCallback(
    (key: keyof typeof translations.ja) =>
      translations[language]?.[key] || translations.ja[key],
    [language]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [volcanoesRes, warningsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/volcanoes?monitored_only=${!showAll}`),
        fetch(`${API_BASE_URL}/api/v1/volcanoes/warnings?lang=${language}`),
      ]);

      if (!volcanoesRes.ok || !warningsRes.ok) {
        throw new Error('Failed to fetch volcano data');
      }

      const [volcanoesData, warningsData] = await Promise.all([
        volcanoesRes.json(),
        warningsRes.json(),
      ]);

      setVolcanoes(volcanoesData);
      setWarnings(warningsData);
    } catch (err) {
      console.error('Volcano fetch error:', err);
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [showAll, language, t]);

  useEffect(() => {
    fetchData();
    // 10分ごとに更新
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getAlertLevelStyles = (level: number) => {
    switch (level) {
      case 5:
        return 'bg-purple-600 text-white';
      case 4:
        return 'bg-red-600 text-white';
      case 3:
        return 'bg-orange-500 text-white';
      case 2:
        return 'bg-yellow-500 text-black';
      case 1:
      default:
        return 'bg-gray-200 text-gray-700';
    }
  };

  const getAlertLevelText = (level: number) => {
    switch (level) {
      case 5:
        return t('level5');
      case 4:
        return t('level4');
      case 3:
        return t('level3');
      case 2:
        return t('level2');
      case 1:
      default:
        return t('level1');
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-100 rounded-lg animate-pulse">
        <div className="h-6 bg-gray-300 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-300 rounded w-2/3"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 border border-red-300 rounded-lg">
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
        🌋 {t('title')}
      </h3>

      {/* 警報がある場合 */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warning, index) => (
            <div
              key={`warning-${index}`}
              className={`p-4 rounded-lg ${getAlertLevelStyles(warning.alert_level)}`}
              role="alert"
              aria-live={warning.alert_level >= 4 ? 'assertive' : 'polite'}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">🌋</span>
                <div>
                  <div className="font-bold">
                    {warning.volcano_name} - {t('alertLevel')} {warning.alert_level}
                  </div>
                  <p className="text-sm">{warning.alert_level_name}</p>
                  {warning.action && (
                    <p className="text-sm mt-1">
                      {t('action')}: {warning.action}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 警報がない場合 */}
      {warnings.length === 0 && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700">✅ {t('noAlerts')}</p>
        </div>
      )}

      {/* 常時観測火山リスト */}
      <div className="mt-4">
        <h4 className="font-semibold text-gray-700 mb-2">{t('monitoredVolcanoes')}</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {volcanoes.slice(0, 12).map((volcano) => (
            <button
              key={volcano.code}
              onClick={() => onVolcanoSelect?.(volcano)}
              className="p-2 text-left text-sm bg-gray-50 hover:bg-gray-100 rounded border transition-colors"
            >
              <span className="font-medium">
                {language !== 'ja' && volcano.name_en ? volcano.name_en : volcano.name}
              </span>
              {volcano.alert_level && volcano.alert_level > 1 && (
                <span
                  className={`ml-2 px-1.5 py-0.5 text-xs rounded ${getAlertLevelStyles(
                    volcano.alert_level
                  )}`}
                >
                  Lv.{volcano.alert_level}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
