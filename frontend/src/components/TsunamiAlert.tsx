'use client';

import React from 'react';
import { TsunamiIcon, SafeIcon } from './icons/DisasterIcons';

interface TsunamiAlertProps {
  warning: string;
  language: string;
  compact?: boolean;
}

// 津波警報レベルの判定
const getTsunamiLevel = (warning: string): 'none' | 'advisory' | 'warning' | 'major' => {
  const lowerWarning = warning.toLowerCase();

  // 津波なし
  if (warning === 'なし' || warning === 'None' || warning === '無し' || lowerWarning.includes('no tsunami')) {
    return 'none';
  }

  // 大津波警報
  if (warning.includes('大津波') || lowerWarning.includes('major') || lowerWarning.includes('great')) {
    return 'major';
  }

  // 津波警報
  if (warning.includes('警報') || lowerWarning.includes('warning')) {
    return 'warning';
  }

  // 津波注意報
  if (warning.includes('注意') || lowerWarning.includes('advisory') || lowerWarning.includes('watch')) {
    return 'advisory';
  }

  return 'none';
};

// レベル別スタイル
const levelStyles = {
  none: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    icon: 'text-green-500',
    pulse: false,
  },
  advisory: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    text: 'text-yellow-800',
    icon: 'text-yellow-600',
    pulse: false,
  },
  warning: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-800',
    icon: 'text-orange-600',
    pulse: true,
  },
  major: {
    bg: 'bg-red-100',
    border: 'border-red-400',
    text: 'text-red-900',
    icon: 'text-red-600',
    pulse: true,
  },
};

// 多言語メッセージ
const messages: Record<string, Record<string, { title: string; action: string; detail?: string }>> = {
  none: {
    ja: { title: '津波の心配なし', action: '安全です' },
    en: { title: 'No Tsunami Risk', action: 'Safe' },
    zh: { title: '无海啸风险', action: '安全' },
    ko: { title: '쓰나미 위험 없음', action: '안전' },
    vi: { title: 'Không có nguy cơ sóng thần', action: 'An toàn' },
    ne: { title: 'सुनामी खतरा छैन', action: 'सुरक्षित' },
    th: { title: 'ไม่มีความเสี่ยงสึนามิ', action: 'ปลอดภัย' },
    id: { title: 'Tidak ada risiko tsunami', action: 'Aman' },
    easy_ja: { title: 'つなみの しんぱい なし', action: 'あんぜん です' },
  },
  advisory: {
    ja: { title: '津波注意報', action: '海岸から離れてください', detail: '予想される津波の高さ: 1m以下' },
    en: { title: 'Tsunami Advisory', action: 'Stay away from the coast', detail: 'Expected height: under 1m' },
    zh: { title: '海啸注意报', action: '请远离海岸', detail: '预计浪高: 1米以下' },
    ko: { title: '쓰나미 주의보', action: '해안에서 멀리 떨어지세요', detail: '예상 높이: 1m 이하' },
    vi: { title: 'Khuyến cáo sóng thần', action: 'Tránh xa bờ biển', detail: 'Chiều cao dự kiến: dưới 1m' },
    ne: { title: 'सुनामी सतर्कता', action: 'समुद्री किनाराबाट टाढा रहनुहोस्' },
    th: { title: 'คำเตือนสึนามิ', action: 'อยู่ห่างจากชายฝั่ง' },
    id: { title: 'Peringatan tsunami', action: 'Menjauhlah dari pantai' },
    easy_ja: { title: 'つなみ ちゅういほう', action: 'うみから はなれて', detail: 'たかさ: 1メートル いか' },
  },
  warning: {
    ja: { title: '津波警報', action: '今すぐ高台へ避難！', detail: '予想される津波の高さ: 1〜3m' },
    en: { title: 'TSUNAMI WARNING', action: 'Evacuate to high ground NOW!', detail: 'Expected height: 1-3m' },
    zh: { title: '海啸警报', action: '立即撤离到高处！', detail: '预计浪高: 1-3米' },
    ko: { title: '쓰나미 경보', action: '지금 당장 고지대로 대피하세요!', detail: '예상 높이: 1-3m' },
    vi: { title: 'CẢNH BÁO SÓNG THẦN', action: 'Sơ tán đến vùng cao NGAY!', detail: 'Chiều cao: 1-3m' },
    ne: { title: 'सुनामी चेतावनी', action: 'अहिले नै उच्च ठाउँमा जानुहोस्!' },
    th: { title: 'เตือนภัยสึนามิ', action: 'อพยพไปที่สูงทันที!' },
    id: { title: 'PERINGATAN TSUNAMI', action: 'Evakuasi ke dataran tinggi SEKARANG!' },
    easy_ja: { title: 'つなみ けいほう', action: 'いますぐ たかい ところへ にげて！', detail: 'たかさ: 1〜3メートル' },
  },
  major: {
    ja: { title: '大津波警報', action: '最大限の警戒！今すぐ避難！', detail: '予想される津波の高さ: 3m以上' },
    en: { title: 'MAJOR TSUNAMI WARNING', action: 'MAXIMUM ALERT! Evacuate NOW!', detail: 'Expected height: 3m+' },
    zh: { title: '大海啸警报', action: '最高警戒！立即撤离！', detail: '预计浪高: 3米以上' },
    ko: { title: '대규모 쓰나미 경보', action: '최대 경계! 지금 대피하세요!', detail: '예상 높이: 3m 이상' },
    vi: { title: 'CẢNH BÁO SÓNG THẦN LỚN', action: 'BÁO ĐỘNG TỐI ĐA! Sơ tán NGAY!', detail: 'Chiều cao: 3m+' },
    ne: { title: 'ठूलो सुनामी चेतावनी', action: 'अधिकतम सतर्कता! अहिले जानुहोस्!' },
    th: { title: 'เตือนภัยสึนามิใหญ่', action: 'เตือนภัยสูงสุด! อพยพทันที!' },
    id: { title: 'PERINGATAN TSUNAMI BESAR', action: 'SIAGA MAKSIMUM! Evakuasi SEKARANG!' },
    easy_ja: { title: 'おおつなみ けいほう', action: 'いますぐ にげて！ たかい ところへ！', detail: 'たかさ: 3メートル いじょう' },
  },
};

export default function TsunamiAlert({ warning, language, compact = false }: TsunamiAlertProps) {
  const level = getTsunamiLevel(warning);
  const style = levelStyles[level];
  const msg = messages[level][language] || messages[level]['en'];

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${style.bg} ${style.border} border ${style.text} ${
          style.pulse ? 'animate-pulse' : ''
        }`}
      >
        {level === 'none' ? (
          <SafeIcon size={20} />
        ) : (
          <TsunamiIcon size={20} animate={style.pulse} />
        )}
        <span className="text-sm font-medium">{msg.title}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl ${style.bg} ${style.border} border-2 p-4 ${
        style.pulse ? 'animate-pulse' : ''
      }`}
      role="alert"
      aria-live={level !== 'none' ? 'assertive' : 'polite'}
    >
      <div className="flex items-start gap-4">
        {/* アイコン */}
        <div className={`flex-shrink-0 ${style.icon}`}>
          {level === 'none' ? (
            <SafeIcon size={48} />
          ) : (
            <TsunamiIcon size={48} animate={style.pulse} />
          )}
        </div>

        {/* コンテンツ */}
        <div className="flex-1">
          <h3 className={`text-lg font-bold ${style.text}`}>{msg.title}</h3>
          <p className={`text-base font-medium mt-1 ${style.text}`}>{msg.action}</p>
          {msg.detail && (
            <p className={`text-sm mt-1 ${style.text} opacity-80`}>{msg.detail}</p>
          )}
        </div>

        {/* 危険度インジケーター */}
        {level !== 'none' && (
          <div className="flex flex-col gap-1">
            {['major', 'warning', 'advisory'].map((l) => (
              <div
                key={l}
                className={`w-4 h-4 rounded-full ${
                  l === level ? 'ring-2 ring-offset-1 ring-gray-400' : ''
                }`}
                style={{
                  backgroundColor:
                    l === 'major' ? '#DC2626' :
                    l === 'warning' ? '#EA580C' :
                    '#FBBF24',
                  opacity: l === level ? 1 : 0.3,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 避難アクションボタン（警報時のみ） */}
      {(level === 'warning' || level === 'major') && (
        <div className="mt-4 flex gap-2">
          <button
            className={`flex-1 py-2 px-4 rounded-lg font-bold text-white ${
              level === 'major' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
            } transition-colors`}
            onClick={() => {/* 避難所検索へ遷移 */}}
          >
            {language === 'ja' ? '避難所を探す' :
             language === 'easy_ja' ? 'ひなんじょを さがす' :
             'Find Shelter'}
          </button>
        </div>
      )}
    </div>
  );
}

// 津波レベルインジケーター（小型）
export function TsunamiLevelIndicator({ warning }: { warning: string }) {
  const level = getTsunamiLevel(warning);

  const colors = {
    none: 'bg-green-500',
    advisory: 'bg-yellow-500',
    warning: 'bg-orange-500',
    major: 'bg-red-600',
  };

  return (
    <div
      className={`w-3 h-3 rounded-full ${colors[level]} ${
        level === 'warning' || level === 'major' ? 'animate-pulse' : ''
      }`}
      aria-label={`Tsunami level: ${level}`}
    />
  );
}
