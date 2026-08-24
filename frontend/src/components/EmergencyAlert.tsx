'use client';


import React, { useState, useEffect, useCallback } from 'react';
import { EarthquakeIcon, TsunamiIcon, AlertIcon } from './icons/DisasterIcons';
import { getLocale } from '@/i18n/translations';
import { API_BASE_URL } from '@/config/api';
import {
  selectAlert,
  shouldDisplay,
  canAutoDismiss,
  type TsunamiLike,
} from '@/lib/emergencyAlert';

interface EmergencyAlertProps {
  /** SSE で届いた現在の津波情報。page.tsx が渡す。
   *  未指定なら初回に自分で /api/v1/tsunami/active を取りに行く */
  tsunamis?: TsunamiLike[];
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

// （旧）デモ用の空配列はここにあった。fetch も SSE も無く、この配列が空のため
// **全画面の緊急警報は一度も表示されなかった**。実データは selectAlert 経由で導出する。

/** 警報の見出し・本文・行動指示を16言語で組み立てる。
 *  実際の警報とテスト用の警報で同じ文言を使うため関数に切り出している
 *  （以前はテスト用トリガーの中にしか無く、実警報から使えなかった）。 */
/**
 * 津波の見出しは**警報レベルごとに変える**。気象庁の区分は
 * 津波注意報 / 津波警報 / 大津波警報 の3段で、それぞれ意味も取るべき行動も違う。
 *
 * レベルに関わらず「津波警報」と出していた時期があり、
 * **大津波警報を「津波警報」と表示して危険を過小に伝え、
 * 注意報を「警報」と表示して過大に伝える**という両方向の誤りが起きていた。
 * 英語は気象庁の公式訳（Major Tsunami Warning / Tsunami Warning / Tsunami Advisory）に合わせている。
 */
export const TSUNAMI_TITLES: Record<'advisory' | 'warning' | 'emergency', Record<string, string>> = {
  emergency: {
    ja: '大津波警報', en: 'Major Tsunami Warning', zh: '大海啸警报', 'zh-TW': '大海嘯警報',
    ko: '대형 쓰나미 경보', vi: 'Cảnh báo sóng thần lớn', th: 'เตือนภัยสึนามิขนาดใหญ่',
    id: 'Peringatan Tsunami Besar', ms: 'Amaran Tsunami Besar', tl: 'Malaking Babala sa Tsunami',
    ne: 'ठूलो सुनामी चेतावनी', fr: 'Alerte tsunami majeur', de: 'Schwere Tsunami-Warnung',
    it: 'Allerta tsunami grave', es: 'Alerta mayor de tsunami', easy_ja: 'おおきい つなみが きます',
  },
  warning: {
    ja: '津波警報', en: 'Tsunami Warning', zh: '海啸警报', 'zh-TW': '海嘯警報',
    ko: '쓰나미 경보', vi: 'Cảnh báo sóng thần', th: 'เตือนภัยสึนามิ',
    id: 'Peringatan Tsunami', ms: 'Amaran Tsunami', tl: 'Babala sa Tsunami',
    ne: 'सुनामी चेतावनी', fr: 'Alerte tsunami', de: 'Tsunami-Warnung',
    it: 'Allerta tsunami', es: 'Alerta de tsunami', easy_ja: 'つなみが きます',
  },
  advisory: {
    ja: '津波注意報', en: 'Tsunami Advisory', zh: '海啸注意报', 'zh-TW': '海嘯注意報',
    ko: '쓰나미 주의보', vi: 'Khuyến cáo sóng thần', th: 'ประกาศเฝ้าระวังสึนามิ',
    id: 'Imbauan Tsunami', ms: 'Nasihat Tsunami', tl: 'Payo sa Tsunami',
    ne: 'सुनामी सूचना', fr: 'Avis de tsunami', de: 'Tsunami-Hinweis',
    it: 'Avviso tsunami', es: 'Aviso de tsunami', easy_ja: 'つなみに きを つけて',
  },
};

function buildAlertContent(
  id: string,
  type: 'earthquake' | 'tsunami',
  level: 'advisory' | 'warning' | 'emergency'
): AlertData {
  // 津波はレベルごとに正式名称が異なるので専用の表を引く。
  // 地震（緊急地震速報）はレベルで名称が変わらないので従来どおり
  if (type === 'tsunami') {
    const base = buildBaseContent(id, type, level);
    return { ...base, title: TSUNAMI_TITLES[level] };
  }
  return buildBaseContent(id, type, level);
}

function buildBaseContent(
  id: string,
  type: 'earthquake' | 'tsunami',
  level: 'advisory' | 'warning' | 'emergency'
): AlertData {
  return {
    id,
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
}

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
// **本文の文字色を淡い色にしない。**
// 以前は message に text-red-100 / text-orange-100 / text-yellow-800 を使っており、
// 実測コントラストは 3.95 / 2.45 / 4.47 と全レベルで WCAG AA (4.5) を下回っていた。
// このアプリで最も重要な画面が、最も読みにくいという状態だった。
// 階調は透明度ではなく文字サイズと太さで付ける。
//
// warning は背景を orange-500 のままにすると白文字が 2.80 にしかならないため、
// **背景ごと濃い橙へ落として**白文字 4.83 を確保している（橙の識別性は保つ）。
const alertStyles = {
  emergency: {
    overlay: 'bg-red-900/95',
    container: 'bg-red-600 border-red-400',
    icon: 'text-white',
    title: 'text-white',
    message: 'text-white',          // red-600 + 白 = 4.83
    button: 'bg-white text-red-700 hover:bg-red-100',
    pulse: true,
  },
  warning: {
    overlay: 'bg-orange-900/90',
    container: 'bg-orange-700 border-orange-400',
    icon: 'text-white',
    title: 'text-white',
    message: 'text-white',          // orange-700 + 白 = 5.94
    button: 'bg-white text-orange-800 hover:bg-orange-100',
    pulse: true,
  },
  advisory: {
    overlay: 'bg-yellow-900/80',
    container: 'bg-yellow-400 border-yellow-200',
    icon: 'text-yellow-900',
    title: 'text-yellow-900',
    message: 'text-yellow-900',     // yellow-400 + yellow-900 = 5.66
    button: 'bg-yellow-900 text-white hover:bg-yellow-800',
    pulse: false,
  },
};

export default function EmergencyAlert({ language, tsunamis, onDismiss }: EmergencyAlertProps) {
  // 手動テスト用に「その場で出した」警報を保持する枠。実警報は下で導出する
  const [manualAlert, setManualAlert] = useState<AlertData | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // 初回に自分で取りに行った分。SSE は**変化があったときしか配信しない**ため、
  // 既に津波警報が出ている最中に開いた人には何も届かない。そこを埋める
  const [fetchedTsunamis, setFetchedTsunamis] = useState<TsunamiLike[]>([]);
  // 閉じた警報。SSE が10秒ごとに来るので、抑制しないと閉じた直後に再表示されて
  // 画面を操作できなくなる。鍵にレベルを含めてあるので**引き上げは貫通する**
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/tsunami/active`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setFetchedTsunamis(data);
      } catch {
        // 取れなくても画面は壊さない。以降は SSE 側の更新に委ねる
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // props（SSE）が来ていればそれを、無ければ初回取得分を使う
  const effectiveTsunamis = tsunamis ?? fetchedTsunamis;
  const derivedAlert = selectAlert(effectiveTsunamis);
  const showDerived = shouldDisplay(derivedAlert, dismissed);

  const activeAlert: AlertData | null =
    manualAlert ??
    (showDerived && derivedAlert
      ? buildAlertContent(derivedAlert.dismissKey, 'tsunami', derivedAlert.severity)
      : null);
  const isVisible = activeAlert !== null;

  const handleDismiss = useCallback(() => {
    setManualAlert(null);
    if (derivedAlert) {
      setDismissed((prev) => new Set(prev).add(derivedAlert.dismissKey));
    }
    onDismiss?.();
  }, [onDismiss, derivedAlert]);

  // 自動解除カウントダウン。**津波警報・大津波警報は自動で閉じない。**
  // 全画面を占有してでも見てもらう設計なのに、見ていなくても数秒で
  // 消えるのでは意味がない（canAutoDismiss がその判断を持つ）
  useEffect(() => {
    if (activeAlert && canAutoDismiss(activeAlert.level) && isVisible) {
      setCountdown(30);
      const timer = setInterval(() => {
        setCountdown((prev) => (prev === null ? null : prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [activeAlert, isVisible]);

  // カウントダウン完了で自動解除（setState updater内での副作用を避ける）
  useEffect(() => {
    if (countdown !== null && countdown <= 0) {
      setCountdown(null);
      handleDismiss();
    }
  }, [countdown, handleDismiss]);

  // テスト用：警報をトリガー
  const triggerTestAlert = (type: 'earthquake' | 'tsunami', level: 'advisory' | 'warning' | 'emergency') => {
    const testAlert = buildAlertContent(Date.now().toString(), type, level);
    setManualAlert(testAlert);
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
              {new Date(activeAlert.timestamp).toLocaleTimeString(getLocale(language))}
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
