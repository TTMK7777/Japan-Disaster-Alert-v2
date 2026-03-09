'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';

interface Warning {
  id: string;
  type: string;
  title: string;
  title_translated?: string;
  description: string;
  description_translated?: string;
  area: string;
  issued_at: string;
  severity: string;
}

interface WarningBannerProps {
  areaCode?: string;
  language?: string;
  onWarningsUpdate?: (warnings: Warning[]) => void;
}

// 都道府県コードと名前のマッピング
const PREFECTURES: { code: string; ja: string; en: string }[] = [
  { code: '016000', ja: '北海道', en: 'Hokkaido' },
  { code: '020000', ja: '青森県', en: 'Aomori' },
  { code: '030000', ja: '岩手県', en: 'Iwate' },
  { code: '040000', ja: '宮城県', en: 'Miyagi' },
  { code: '050000', ja: '秋田県', en: 'Akita' },
  { code: '060000', ja: '山形県', en: 'Yamagata' },
  { code: '070000', ja: '福島県', en: 'Fukushima' },
  { code: '080000', ja: '茨城県', en: 'Ibaraki' },
  { code: '090000', ja: '栃木県', en: 'Tochigi' },
  { code: '100000', ja: '群馬県', en: 'Gunma' },
  { code: '110000', ja: '埼玉県', en: 'Saitama' },
  { code: '120000', ja: '千葉県', en: 'Chiba' },
  { code: '130000', ja: '東京都', en: 'Tokyo' },
  { code: '140000', ja: '神奈川県', en: 'Kanagawa' },
  { code: '150000', ja: '新潟県', en: 'Niigata' },
  { code: '160000', ja: '富山県', en: 'Toyama' },
  { code: '170000', ja: '石川県', en: 'Ishikawa' },
  { code: '180000', ja: '福井県', en: 'Fukui' },
  { code: '190000', ja: '山梨県', en: 'Yamanashi' },
  { code: '200000', ja: '長野県', en: 'Nagano' },
  { code: '210000', ja: '岐阜県', en: 'Gifu' },
  { code: '220000', ja: '静岡県', en: 'Shizuoka' },
  { code: '230000', ja: '愛知県', en: 'Aichi' },
  { code: '240000', ja: '三重県', en: 'Mie' },
  { code: '250000', ja: '滋賀県', en: 'Shiga' },
  { code: '260000', ja: '京都府', en: 'Kyoto' },
  { code: '270000', ja: '大阪府', en: 'Osaka' },
  { code: '280000', ja: '兵庫県', en: 'Hyogo' },
  { code: '290000', ja: '奈良県', en: 'Nara' },
  { code: '300000', ja: '和歌山県', en: 'Wakayama' },
  { code: '310000', ja: '鳥取県', en: 'Tottori' },
  { code: '320000', ja: '島根県', en: 'Shimane' },
  { code: '330000', ja: '岡山県', en: 'Okayama' },
  { code: '340000', ja: '広島県', en: 'Hiroshima' },
  { code: '350000', ja: '山口県', en: 'Yamaguchi' },
  { code: '360000', ja: '徳島県', en: 'Tokushima' },
  { code: '370000', ja: '香川県', en: 'Kagawa' },
  { code: '380000', ja: '愛媛県', en: 'Ehime' },
  { code: '390000', ja: '高知県', en: 'Kochi' },
  { code: '400000', ja: '福岡県', en: 'Fukuoka' },
  { code: '410000', ja: '佐賀県', en: 'Saga' },
  { code: '420000', ja: '長崎県', en: 'Nagasaki' },
  { code: '430000', ja: '熊本県', en: 'Kumamoto' },
  { code: '440000', ja: '大分県', en: 'Oita' },
  { code: '450000', ja: '宮崎県', en: 'Miyazaki' },
  { code: '460000', ja: '鹿児島県', en: 'Kagoshima' },
  { code: '471000', ja: '沖縄県', en: 'Okinawa' },
];

// 多言語対応のテキスト
const translations: Record<string, Record<string, string>> = {
  ja: {
    title: '警報・注意報',
    noWarnings: '現在、警報・注意報は発表されていません',
    loading: '読み込み中...',
    error: '情報を取得できませんでした',
    retry: '再試行',
    issuedAt: '発表時刻',
    specialWarning: '特別警報',
    warning: '警報',
    advisory: '注意報',
    selectArea: '地域を選択',
  },
  en: {
    title: 'Warnings & Advisories',
    noWarnings: 'No warnings or advisories currently in effect',
    loading: 'Loading...',
    error: 'Failed to load information',
    retry: 'Retry',
    issuedAt: 'Issued at',
    specialWarning: 'Special Warning',
    warning: 'Warning',
    advisory: 'Advisory',
    selectArea: 'Select Area',
  },
  easy_ja: {
    title: 'けいほう・ちゅういほう',
    noWarnings: 'いま、けいほうは ありません',
    loading: 'よみこみちゅう...',
    error: 'じょうほうを とれませんでした',
    retry: 'もういちど',
    issuedAt: 'はっぴょう じかん',
    specialWarning: 'とくべつ けいほう',
    warning: 'けいほう',
    advisory: 'ちゅういほう',
    selectArea: 'ちいきを えらぶ',
  },
  zh: {
    title: '警报・注意报',
    noWarnings: '目前没有发布警报或注意报',
    loading: '加载中...',
    error: '无法获取信息',
    retry: '重试',
    issuedAt: '发布时间',
    specialWarning: '特别警报',
    warning: '警报',
    advisory: '注意报',
    selectArea: '选择地区',
  },
  ko: {
    title: '경보・주의보',
    noWarnings: '현재 경보나 주의보가 발령되지 않았습니다',
    loading: '로딩 중...',
    error: '정보를 가져올 수 없습니다',
    retry: '재시도',
    issuedAt: '발표 시간',
    specialWarning: '특별 경보',
    warning: '경보',
    advisory: '주의보',
    selectArea: '지역 선택',
  },
  vi: {
    title: 'Cảnh báo & Chú ý',
    noWarnings: 'Hiện không có cảnh báo nào',
    loading: 'Đang tải...',
    error: 'Không thể tải thông tin',
    retry: 'Thử lại',
    issuedAt: 'Phát hành lúc',
    specialWarning: 'Cảnh báo đặc biệt',
    warning: 'Cảnh báo',
    advisory: 'Chú ý',
    selectArea: 'Chọn khu vực',
  },
};

// HIGH #11: PrefectureSelector をレンダー外に定義
interface PrefectureSelectorProps {
  selectedAreaCode: string;
  onAreaCodeChange: (code: string) => void;
  language: string;
}

function PrefectureSelector({ selectedAreaCode, onAreaCodeChange, language }: PrefectureSelectorProps) {
  const label = translations[language]?.selectArea || translations.ja.selectArea;
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
        {label}
      </label>
      <select
        value={selectedAreaCode}
        onChange={(e) => onAreaCodeChange(e.target.value)}
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {PREFECTURES.map((pref) => (
          <option key={pref.code} value={pref.code}>
            {language === 'ja' || language === 'easy_ja' ? pref.ja : `${pref.en} (${pref.ja})`}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function WarningBanner({
  areaCode: initialAreaCode = '130000',
  language = 'ja',
  onWarningsUpdate,
}: WarningBannerProps) {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAreaCode, setSelectedAreaCode] = useState(initialAreaCode);

  // HIGH #10: onWarningsUpdate を ref で保持し deps から除外
  const onWarningsUpdateRef = useRef(onWarningsUpdate);
  onWarningsUpdateRef.current = onWarningsUpdate;

  const t = useCallback(
    (key: keyof typeof translations.ja) =>
      translations[language]?.[key] || translations.ja[key],
    [language]
  );

  // 現在選択中の都道府県情報を取得
  const selectedPrefecture = PREFECTURES.find(p => p.code === selectedAreaCode);
  const prefectureName = language === 'ja' || language === 'easy_ja'
    ? selectedPrefecture?.ja
    : selectedPrefecture?.en;

  const fetchWarnings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // HIGH #9: AbortController でタイムアウトを設定
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        `${API_BASE_URL}/api/v1/alerts?area_code=${selectedAreaCode}&lang=${language}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Failed to fetch warnings');
      }

      const data = await response.json();
      setWarnings(data);
      onWarningsUpdateRef.current?.(data);
    } catch (err) {
      console.error('Warning fetch error:', err);
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [selectedAreaCode, language, t]);

  useEffect(() => {
    fetchWarnings();
    // 5分ごとに更新
    const interval = setInterval(fetchWarnings, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWarnings]);

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'extreme':
        return 'bg-purple-600 text-white border-purple-800 animate-pulse';
      case 'high':
        return 'bg-red-600 text-white border-red-800';
      case 'medium':
        return 'bg-yellow-500 text-black border-yellow-700';
      case 'low':
        return 'bg-blue-500 text-white border-blue-700';
      default:
        return 'bg-gray-500 text-white border-gray-700';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'extreme':
        return t('specialWarning');
      case 'high':
        return t('warning');
      case 'medium':
      case 'low':
        return t('advisory');
      default:
        return '';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'extreme':
        return '🚨';
      case 'high':
        return '⚠️';
      case 'medium':
        return '⚡';
      case 'low':
        return 'ℹ️';
      default:
        return '📢';
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse">
        <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-2/3"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-lg">
        <p className="text-red-700 dark:text-red-300">{error}</p>
        <button
          onClick={fetchWarnings}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  if (warnings.length === 0) {
    return (
      <div className="space-y-3">
        <PrefectureSelector
          selectedAreaCode={selectedAreaCode}
          onAreaCodeChange={setSelectedAreaCode}
          language={language}
        />
        <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✅</span>
            <div>
              <h3 className="font-bold text-green-800 dark:text-green-200">{t('title')} - {prefectureName}</h3>
              <p className="text-green-700 dark:text-green-300">{t('noWarnings')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PrefectureSelector
        selectedAreaCode={selectedAreaCode}
        onAreaCodeChange={setSelectedAreaCode}
        language={language}
      />
      <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{t('title')} - {prefectureName}</h3>
      {warnings.map((warning, index) => (
        <div
          key={`${warning.id}-${index}`}
          className={`p-4 rounded-lg border-2 ${getSeverityStyles(warning.severity)}`}
          role="alert"
          aria-live={warning.severity === 'extreme' ? 'assertive' : 'polite'}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">
              {getSeverityIcon(warning.severity)}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-black/20">
                  {getSeverityLabel(warning.severity)}
                </span>
                <h4 className="font-bold">
                  {language !== 'ja' && warning.title_translated
                    ? warning.title_translated
                    : warning.title}
                </h4>
              </div>
              <p className="mt-1 text-sm opacity-90">
                {language !== 'ja' && warning.description_translated
                  ? warning.description_translated
                  : warning.description}
              </p>
              <p className="mt-2 text-xs opacity-75">
                📍 {warning.area} | {t('issuedAt')}: {new Date(warning.issued_at).toLocaleString(
                  language === 'ja' ? 'ja-JP' : 'en-US'
                )}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
