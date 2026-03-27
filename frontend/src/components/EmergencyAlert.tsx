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
    'zh-TW': '關閉',
    ko: '닫기',
    vi: 'Đóng',
    th: 'ปิด',
    id: 'Tutup',
    ms: 'Tutup',
    tl: 'Isara',
    ne: 'बन्द गर्नुहोस्',
    fr: 'Fermer',
    de: 'Schlie\u00dfen',
    it: 'Chiudi',
    es: 'Cerrar',
    easy_ja: 'とじる',
  },
  understood: {
    ja: '了解しました',
    en: 'I understand',
    zh: '我明白了',
    'zh-TW': '我明白了',
    ko: '이해했습니다',
    vi: 'Tôi hiểu',
    th: 'ฉันเข้าใจแล้ว',
    id: 'Saya mengerti',
    ms: 'Saya faham',
    tl: 'Naiintindihan ko',
    ne: 'बुझें',
    fr: 'J\'ai compris',
    de: 'Verstanden',
    it: 'Ho capito',
    es: 'Entendido',
    easy_ja: 'わかりました',
  },
  findShelter: {
    ja: '避難所を探す',
    en: 'Find Shelter',
    zh: '寻找避难所',
    'zh-TW': '尋找避難所',
    ko: '대피소 찾기',
    vi: 'Tìm nơi trú ẩn',
    th: 'ค้นหาที่พักพิง',
    id: 'Cari tempat pengungsian',
    ms: 'Cari tempat perlindungan',
    tl: 'Maghanap ng evacuation center',
    ne: 'आश्रयस्थल खोज्नुहोस्',
    fr: 'Trouver un abri',
    de: 'Notunterkunft finden',
    it: 'Trova rifugio',
    es: 'Buscar refugio',
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
        'zh-TW': type === 'earthquake' ? '緊急地震速報' : '海嘯警報',
        ko: type === 'earthquake' ? '긴급지진속보' : '쓰나미 경보',
        vi: type === 'earthquake' ? 'Cảnh báo động đất' : 'Cảnh báo sóng thần',
        th: type === 'earthquake' ? 'เตือนภัยแผ่นดินไหว' : 'เตือนภัยสึนามิ',
        id: type === 'earthquake' ? 'Peringatan Gempa' : 'Peringatan Tsunami',
        ms: type === 'earthquake' ? 'Amaran Gempa Bumi' : 'Amaran Tsunami',
        tl: type === 'earthquake' ? 'Babala sa Lindol' : 'Babala sa Tsunami',
        ne: type === 'earthquake' ? 'भूकम्प चेतावनी' : 'सुनामी चेतावनी',
        fr: type === 'earthquake' ? 'Alerte Tremblement de terre' : 'Alerte Tsunami',
        de: type === 'earthquake' ? 'Erdbebenwarnung' : 'Tsunamiwarnung',
        it: type === 'earthquake' ? 'Allerta Terremoto' : 'Allerta Tsunami',
        es: type === 'earthquake' ? 'Alerta de Terremoto' : 'Alerta de Tsunami',
        easy_ja: type === 'earthquake' ? 'じしん そくほう' : 'つなみ けいほう',
      },
      message: {
        ja: type === 'earthquake' ? '強い揺れに警戒してください' : '沿岸部の方は直ちに高台に避難してください',
        en: type === 'earthquake' ? 'Expect strong shaking' : 'Evacuate to higher ground immediately',
        zh: type === 'earthquake' ? '请警惕强烈摇晃' : '沿海地区请立即撤离到高处',
        'zh-TW': type === 'earthquake' ? '請警惕強烈搖晃' : '沿海地區請立即撤離到高處',
        ko: type === 'earthquake' ? '강한 흔들림에 주의하세요' : '해안 지역은 즉시 고지대로 대피하세요',
        vi: type === 'earthquake' ? 'Chuẩn bị cho rung lắc mạnh' : 'Sơ tán đến vùng cao ngay lập tức',
        th: type === 'earthquake' ? 'เตรียมรับแรงสั่นสะเทือน' : 'อพยพไปยังที่สูงทันที',
        id: type === 'earthquake' ? 'Siapkan diri untuk guncangan kuat' : 'Evakuasi ke tempat tinggi segera',
        ms: type === 'earthquake' ? 'Bersedia untuk gegaran kuat' : 'Pindah ke tempat tinggi segera',
        tl: type === 'earthquake' ? 'Maghanda para sa malakas na lindol' : 'Lumikas sa mataas na lugar agad',
        ne: type === 'earthquake' ? 'बलियो हल्लाबाट सावधान रहनुहोस्' : 'तुरुन्तै उच्च भूमिमा सर्नुहोस्',
        fr: type === 'earthquake' ? 'Pr\u00e9parez-vous \u00e0 de fortes secousses' : '\u00c9vacuez vers les hauteurs imm\u00e9diatement',
        de: type === 'earthquake' ? 'Starke Ersch\u00fctterungen erwartet' : 'Sofort auf h\u00f6heres Gel\u00e4nde evakuieren',
        it: type === 'earthquake' ? 'Preparati a forti scosse' : 'Evacua verso zone elevate immediatamente',
        es: type === 'earthquake' ? 'Espere temblores fuertes' : 'Evacuar a tierras altas inmediatamente',
        easy_ja: type === 'earthquake' ? 'つよい ゆれに きをつけて' : 'たかい ところへ にげて',
      },
      action: {
        ja: type === 'earthquake' ? '頭を守り、机の下に' : '高台・避難ビルへ避難',
        en: type === 'earthquake' ? 'Protect your head, get under a table' : 'Go to high ground or evacuation building',
        zh: type === 'earthquake' ? '保护头部，躲到桌子下' : '前往高处或避难建筑',
        'zh-TW': type === 'earthquake' ? '保護頭部，躲到桌子下' : '前往高處或避難建築',
        ko: type === 'earthquake' ? '머리를 보호하고 책상 아래로' : '고지대나 대피소로 이동',
        vi: type === 'earthquake' ? 'Bảo vệ đầu, núp dưới bàn' : 'Đi đến vùng cao hoặc tòa nhà sơ tán',
        th: type === 'earthquake' ? 'ป้องกันศีรษะ หลบใต้โต๊ะ' : 'ไปยังที่สูงหรืออาคารอพยพ',
        id: type === 'earthquake' ? 'Lindungi kepala, berlindung di bawah meja' : 'Pergi ke tempat tinggi atau gedung evakuasi',
        ms: type === 'earthquake' ? 'Lindungi kepala, berlindung di bawah meja' : 'Pergi ke tempat tinggi atau bangunan pemindahan',
        tl: type === 'earthquake' ? 'Protektahan ang ulo, pumasok sa ilalim ng mesa' : 'Pumunta sa mataas na lugar o evacuation building',
        ne: type === 'earthquake' ? 'टाउको जोगाउनुहोस्, टेबल मुनि जानुहोस्' : 'उच्च ठाउँ वा आश्रयमा जानुहोस्',
        fr: type === 'earthquake' ? 'Prot\u00e9gez votre t\u00eate, mettez-vous sous une table' : 'Allez en hauteur ou dans un b\u00e2timent d\'\u00e9vacuation',
        de: type === 'earthquake' ? 'Sch\u00fctzen Sie Ihren Kopf, gehen Sie unter einen Tisch' : 'Gehen Sie auf h\u00f6heres Gel\u00e4nde oder in ein Evakuierungsgeb\u00e4ude',
        it: type === 'earthquake' ? 'Proteggi la testa, mettiti sotto un tavolo' : 'Vai in alto o in un edificio di evacuazione',
        es: type === 'earthquake' ? 'Proteja su cabeza, p\u00f3ngase bajo una mesa' : 'Vaya a un lugar alto o edificio de evacuaci\u00f3n',
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
