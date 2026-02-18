'use client';

import { useState, useEffect } from 'react';

interface AlertBannerProps {
  language: string;
}

interface Alert {
  id: string;
  type: 'emergency' | 'warning' | 'advisory';
  title: string;
  message: string;
}

// 緊急警報の多言語メッセージ
const alertMessages: Record<string, Record<string, { title: string; message: string }>> = {
  tsunami: {
    ja: {
      title: '津波警報',
      message: '沿岸部の方は直ちに高台に避難してください',
    },
    en: {
      title: 'Tsunami Warning',
      message: 'Evacuate to higher ground immediately',
    },
    zh: {
      title: '海啸警报',
      message: '沿海地区请立即撤离到高处',
    },
    ko: {
      title: '쓰나미 경보',
      message: '해안 지역은 즉시 고지대로 대피하세요',
    },
    vi: {
      title: 'Cảnh báo sóng thần',
      message: 'Hãy sơ tán đến nơi cao hơn ngay',
    },
    ne: {
      title: 'सुनामी चेतावनी',
      message: 'तुरुन्तै उच्च भूमिमा सर्नुहोस्',
    },
    easy_ja: {
      title: 'つなみ けいほう',
      message: 'うみの ちかくの ひとは たかい ところに にげて',
    },
  },
  earthquake_large: {
    ja: {
      title: '緊急地震速報',
      message: '強い揺れに警戒してください',
    },
    en: {
      title: 'Earthquake Early Warning',
      message: 'Expect strong shaking',
    },
    zh: {
      title: '紧急地震速报',
      message: '请警惕强烈摇晃',
    },
    ko: {
      title: '긴급 지진 속보',
      message: '강한 흔들림에 주의하세요',
    },
    vi: {
      title: 'Cảnh báo động đất khẩn cấp',
      message: 'Hãy cảnh giác với rung lắc mạnh',
    },
    ne: {
      title: 'आपतकालीन भूकम्प चेतावनी',
      message: 'बलियो हल्लाबाट सावधान रहनुहोस्',
    },
    easy_ja: {
      title: 'じしん そくほう',
      message: 'つよい ゆれに きをつけて',
    },
  },
};

export default function AlertBanner({ language }: AlertBannerProps) {
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // デモ用: 実際の実装ではWebSocketやSSEで警報を受信
    // 現時点では表示しない
    setActiveAlert(null);
    setVisible(false);
  }, []);

  if (!visible || !activeAlert) {
    return null;
  }

  const alertStyle = {
    emergency: 'bg-red-600 text-white pulse-alert',
    warning: 'bg-orange-500 text-white',
    advisory: 'bg-yellow-400 text-gray-900',
  };

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${alertStyle[activeAlert.type]}`}>
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {activeAlert.type === 'emergency' ? '🚨' : activeAlert.type === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <div>
              <div className="font-bold text-lg">{activeAlert.title}</div>
              <div className="text-sm opacity-90">{activeAlert.message}</div>
            </div>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="p-2 hover:bg-white/20 rounded-full"
            aria-label="Close alert"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
