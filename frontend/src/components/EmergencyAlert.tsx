'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { EarthquakeIcon, TsunamiIcon, AlertIcon } from './icons/DisasterIcons';

interface EmergencyAlertProps {
  language: string;
  onDismiss?: () => void;
}

interface AlertData {
  id: string;
  type: 'earthquake' | 'tsunami' | 'warning';
  level: 'advisory' | 'warning' | 'emergency';
  title: Record<string, string>;
  message: Record<string, string>;
  action: Record<string, string>;
  timestamp: Date;
  expires?: Date;
}

// デモ用のテスト警報
const demoAlerts: AlertData[] = [
  // 実際の実装ではWebSocket/SSEで受信
];

// 多言語サポート
const translations = {
  dismiss: {
    ja: '閉じる',
    en: 'Dismiss',
    zh: '关闭',
    ko: '닫기',
    vi: 'Đóng',
    ne: 'बन्द गर्नुहोस्',
    easy_ja: 'とじる',
  },
  understood: {
    ja: '了解しました',
    en: 'I understand',
    zh: '我明白了',
    ko: '이해했습니다',
    vi: 'Tôi hiểu',
    ne: 'बुझें',
    easy_ja: 'わかりました',
  },
  findShelter: {
    ja: '避難所を探す',
    en: 'Find Shelter',
    zh: '寻找避难所',
    ko: '대피소 찾기',
    vi: 'Tìm nơi trú ẩn',
    ne: 'आश्रयस्थल खोज्नुहोस्',
    easy_ja: 'ひなんじょを さがす',
  },
};

// アラートレベル別のスタイル設定
const alertStyles = {
  emergency: {
    overlay: 'bg-red-900/95',
    container: 'bg-red-600 border-red-400',
    icon: 'text-white',
    title: 'text-white',
    message: 'text-red-100',
    button: 'bg-white text-red-700 hover:bg-red-100',
    pulse: true,
  },
  warning: {
    overlay: 'bg-orange-900/90',
    container: 'bg-orange-500 border-orange-300',
    icon: 'text-white',
    title: 'text-white',
    message: 'text-orange-100',
    button: 'bg-white text-orange-700 hover:bg-orange-100',
    pulse: true,
  },
  advisory: {
    overlay: 'bg-yellow-900/80',
    container: 'bg-yellow-400 border-yellow-200',
    icon: 'text-yellow-900',
    title: 'text-yellow-900',
    message: 'text-yellow-800',
    button: 'bg-yellow-900 text-white hover:bg-yellow-800',
    pulse: false,
  },
};

export default function EmergencyAlert({ language, onDismiss }: EmergencyAlertProps) {
  const [activeAlert, setActiveAlert] = useState<AlertData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // デモ用：コンポーネントマウント時に警報をチェック
  useEffect(() => {
    // 実際の実装ではWebSocket接続でリアルタイム受信
    if (demoAlerts.length > 0) {
      setActiveAlert(demoAlerts[0]);
      setIsVisible(true);
    }
  }, []);

  // 自動解除カウントダウン（注意報のみ）
  useEffect(() => {
    if (activeAlert?.level === 'advisory' && isVisible) {
      setCountdown(30);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            handleDismiss();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [activeAlert, isVisible]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      setActiveAlert(null);
      onDismiss?.();
    }, 300);
  }, [onDismiss]);

  // テスト用：警報をトリガー
  const triggerTestAlert = (type: 'earthquake' | 'tsunami', level: 'advisory' | 'warning' | 'emergency') => {
    const testAlert: AlertData = {
      id: Date.now().toString(),
      type,
      level,
      title: {
        ja: type === 'earthquake' ? '緊急地震速報' : '津波警報',
        en: type === 'earthquake' ? 'Earthquake Warning' : 'Tsunami Warning',
        zh: type === 'earthquake' ? '紧急地震速报' : '海啸警报',
        ko: type === 'earthquake' ? '긴급지진속보' : '쓰나미 경보',
        vi: type === 'earthquake' ? 'Cảnh báo động đất' : 'Cảnh báo sóng thần',
        ne: type === 'earthquake' ? 'भूकम्प चेतावनी' : 'सुनामी चेतावनी',
        easy_ja: type === 'earthquake' ? 'じしん そくほう' : 'つなみ けいほう',
      },
      message: {
        ja: type === 'earthquake' ? '強い揺れに警戒してください' : '沿岸部の方は直ちに高台に避難してください',
        en: type === 'earthquake' ? 'Expect strong shaking' : 'Evacuate to higher ground immediately',
        zh: type === 'earthquake' ? '请警惕强烈摇晃' : '沿海地区请立即撤离到高处',
        ko: type === 'earthquake' ? '강한 흔들림에 주의하세요' : '해안 지역은 즉시 고지대로 대피하세요',
        vi: type === 'earthquake' ? 'Chuẩn bị cho rung lắc mạnh' : 'Sơ tán đến vùng cao ngay lập tức',
        ne: type === 'earthquake' ? 'बलियो हल्लाबाट सावधान रहनुहोस्' : 'तुरुन्तै उच्च भूमिमा सर्नुहोस्',
        easy_ja: type === 'earthquake' ? 'つよい ゆれに きをつけて' : 'たかい ところへ にげて',
      },
      action: {
        ja: type === 'earthquake' ? '頭を守り、机の下に' : '高台・避難ビルへ避難',
        en: type === 'earthquake' ? 'Protect your head, get under a table' : 'Go to high ground or evacuation building',
        zh: type === 'earthquake' ? '保护头部，躲到桌子下' : '前往高处或避难建筑',
        ko: type === 'earthquake' ? '머리를 보호하고 책상 아래로' : '고지대나 대피소로 이동',
        vi: type === 'earthquake' ? 'Bảo vệ đầu, núp dưới bàn' : 'Đi đến vùng cao hoặc tòa nhà sơ tán',
        ne: type === 'earthquake' ? 'टाउको जोगाउनुहोस्, टेबल मुनि जानुहोस्' : 'उच्च ठाउँ वा आश्रयमा जानुहोस्',
        easy_ja: type === 'earthquake' ? 'あたまを まもって つくえの したへ' : 'たかい ところへ いこう',
      },
      timestamp: new Date(),
    };
    setActiveAlert(testAlert);
    setIsVisible(true);
  };

  if (!activeAlert || !isVisible) {
    // テスト用ボタン（開発時のみ表示）
    return process.env.NODE_ENV === 'development' ? (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <button
          onClick={() => triggerTestAlert('earthquake', 'emergency')}
          className="px-3 py-2 bg-red-600 text-white rounded-lg text-xs"
        >
          Test: Emergency Earthquake
        </button>
        <button
          onClick={() => triggerTestAlert('tsunami', 'warning')}
          className="px-3 py-2 bg-orange-500 text-white rounded-lg text-xs"
        >
          Test: Tsunami Warning
        </button>
      </div>
    ) : null;
  }

  const style = alertStyles[activeAlert.level];
  const t = (key: keyof typeof translations) =>
    translations[key][language as keyof typeof translations[typeof key]] || translations[key].en;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center ${style.overlay} ${
        style.pulse ? 'animate-emergency-pulse' : ''
      }`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alert-title"
      aria-describedby="alert-message"
    >
      {/* メインアラートカード */}
      <div
        className={`${style.container} border-4 rounded-2xl p-6 md:p-8 mx-4 max-w-lg w-full shadow-2xl animate-alert-appear`}
      >
        {/* アイコンとタイトル */}
        <div className="flex items-center gap-4 mb-4">
          <div className={`flex-shrink-0 ${style.icon}`}>
            {activeAlert.type === 'earthquake' ? (
              <EarthquakeIcon size={64} animate={style.pulse} />
            ) : activeAlert.type === 'tsunami' ? (
              <TsunamiIcon size={64} animate={style.pulse} />
            ) : (
              <AlertIcon size={64} level={activeAlert.level} />
            )}
          </div>
          <div>
            <h2
              id="alert-title"
              className={`text-2xl md:text-3xl font-bold ${style.title}`}
            >
              {activeAlert.title[language] || activeAlert.title.en}
            </h2>
            <p className={`text-sm ${style.message} opacity-80`}>
              {new Date(activeAlert.timestamp).toLocaleTimeString(
                language === 'ja' ? 'ja-JP' : 'en-US'
              )}
            </p>
          </div>
        </div>

        {/* メッセージ */}
        <p
          id="alert-message"
          className={`text-xl md:text-2xl ${style.message} mb-4`}
        >
          {activeAlert.message[language] || activeAlert.message.en}
        </p>

        {/* アクション指示 */}
        <div
          className={`${style.message} text-lg md:text-xl font-bold p-4 rounded-lg mb-6`}
          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
        >
          📍 {activeAlert.action[language] || activeAlert.action.en}
        </div>

        {/* ボタン */}
        <div className="flex flex-col sm:flex-row gap-3">
          {(activeAlert.level === 'warning' || activeAlert.level === 'emergency') && (
            <button
              className={`flex-1 py-3 px-6 rounded-xl font-bold text-lg ${style.button} transition-colors`}
              onClick={() => {
                // 避難所タブへ遷移
                handleDismiss();
              }}
            >
              {t('findShelter')}
            </button>
          )}
          <button
            className={`flex-1 py-3 px-6 rounded-xl font-bold text-lg border-2 border-white/50 ${style.message} hover:bg-white/10 transition-colors`}
            onClick={handleDismiss}
          >
            {t('understood')}
            {countdown !== null && ` (${countdown}s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// 小さいアラートバナー（画面上部固定）
export function AlertBannerCompact({
  type,
  level,
  message,
  language,
  onClose,
}: {
  type: 'earthquake' | 'tsunami' | 'warning';
  level: 'advisory' | 'warning' | 'emergency';
  message: string;
  language: string;
  onClose?: () => void;
}) {
  const style = alertStyles[level];

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 ${style.container} ${
        style.pulse ? 'animate-pulse' : ''
      }`}
    >
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {type === 'earthquake' ? (
            <EarthquakeIcon size={32} animate={style.pulse} />
          ) : type === 'tsunami' ? (
            <TsunamiIcon size={32} animate={style.pulse} />
          ) : (
            <AlertIcon size={32} level={level} />
          )}
          <span className={`font-bold ${style.title}`}>{message}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`p-2 rounded-full hover:bg-white/20 ${style.icon}`}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
