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
    'zh-TW': {
      title: '海嘯警報',
      message: '沿海地區請立即撤離到高處',
    },
    th: {
      title: 'เตือนภัยสึนามิ',
      message: 'อพยพไปที่สูงทันที',
    },
    id: {
      title: 'Peringatan Tsunami',
      message: 'Segera evakuasi ke dataran tinggi',
    },
    ms: {
      title: 'Amaran Tsunami',
      message: 'Segera pindah ke tempat tinggi',
    },
    tl: {
      title: 'Babala sa Tsunami',
      message: 'Lumikas agad sa mataas na lugar',
    },
    fr: {
      title: 'Alerte tsunami',
      message: 'Évacuez immédiatement vers les hauteurs',
    },
    de: {
      title: 'Tsunami-Warnung',
      message: 'Sofort auf Anhöhen evakuieren',
    },
    it: {
      title: 'Allerta tsunami',
      message: 'Evacuare immediatamente verso zone elevate',
    },
    es: {
      title: 'Alerta de tsunami',
      message: 'Evacúe inmediatamente a zonas altas',
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
    'zh-TW': {
      title: '緊急地震速報',
      message: '請警戒強烈搖晃',
    },
    th: {
      title: 'เตือนภัยแผ่นดินไหวฉุกเฉิน',
      message: 'ระวังแรงสั่นสะเทือน',
    },
    id: {
      title: 'Peringatan Dini Gempa',
      message: 'Waspadai guncangan kuat',
    },
    ms: {
      title: 'Amaran Awal Gempa Bumi',
      message: 'Berwaspada terhadap gegaran kuat',
    },
    tl: {
      title: 'Babala sa Lindol',
      message: 'Mag-ingat sa malakas na pagyanig',
    },
    fr: {
      title: "Alerte sismique d'urgence",
      message: 'Préparez-vous à de fortes secousses',
    },
    de: {
      title: 'Erdbeben-Frühwarnung',
      message: 'Starke Erschütterungen erwartet',
    },
    it: {
      title: 'Allerta sismica di emergenza',
      message: 'Attenzione a forti scosse',
    },
    es: {
      title: 'Alerta sísmica de emergencia',
      message: 'Espere fuertes sacudidas',
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
    advisory: 'bg-yellow-400 text-gray-900 dark:bg-yellow-500',
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
