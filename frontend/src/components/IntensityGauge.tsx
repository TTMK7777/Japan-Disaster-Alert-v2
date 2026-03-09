'use client';

import React from 'react';

interface IntensityGaugeProps {
  intensity: string;
  language: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// 震度データ
const intensityData = {
  '1': { level: 1, color: '#F3F4F6', borderColor: '#9CA3AF', textColor: '#374151' },
  '2': { level: 2, color: '#60A5FA', borderColor: '#3B82F6', textColor: 'white' },
  '3': { level: 3, color: '#3B82F6', borderColor: '#2563EB', textColor: 'white' },
  '4': { level: 4, color: '#FDE047', borderColor: '#FACC15', textColor: '#374151' },
  '5弱': { level: 5, color: '#FCD34D', borderColor: '#F59E0B', textColor: '#374151' },
  '5強': { level: 6, color: '#FB923C', borderColor: '#EA580C', textColor: 'white' },
  '6弱': { level: 7, color: '#F87171', borderColor: '#EF4444', textColor: 'white' },
  '6強': { level: 8, color: '#DC2626', borderColor: '#B91C1C', textColor: 'white' },
  '7': { level: 9, color: '#9333EA', borderColor: '#7C3AED', textColor: 'white' },
};

// 多言語ラベル
const labels: Record<string, Record<string, string>> = {
  '1': { ja: '震度1', en: 'Weak', zh: '震度1', ko: '진도1', vi: 'Cấp 1', ne: '१', easy_ja: 'しんど1' },
  '2': { ja: '震度2', en: 'Light', zh: '震度2', ko: '진도2', vi: 'Cấp 2', ne: '२', easy_ja: 'しんど2' },
  '3': { ja: '震度3', en: 'Moderate', zh: '震度3', ko: '진도3', vi: 'Cấp 3', ne: '३', easy_ja: 'しんど3' },
  '4': { ja: '震度4', en: 'Strong', zh: '震度4', ko: '진도4', vi: 'Cấp 4', ne: '४', easy_ja: 'しんど4' },
  '5弱': { ja: '震度5弱', en: 'Very Strong', zh: '震度5弱', ko: '진도5약', vi: 'Cấp 5-', ne: '५-', easy_ja: 'しんど5よわい' },
  '5強': { ja: '震度5強', en: 'Very Strong+', zh: '震度5强', ko: '진도5강', vi: 'Cấp 5+', ne: '५+', easy_ja: 'しんど5つよい' },
  '6弱': { ja: '震度6弱', en: 'Severe', zh: '震度6弱', ko: '진도6약', vi: 'Cấp 6-', ne: '६-', easy_ja: 'しんど6よわい' },
  '6強': { ja: '震度6強', en: 'Severe+', zh: '震度6强', ko: '진도6강', vi: 'Cấp 6+', ne: '६+', easy_ja: 'しんど6つよい' },
  '7': { ja: '震度7', en: 'Violent', zh: '震度7', ko: '진도7', vi: 'Cấp 7', ne: '७', easy_ja: 'しんど7' },
};

// 震度の説明（直感的な行動指示）
const descriptions: Record<string, Record<string, string>> = {
  '1': { ja: '気づかない人も', en: 'Barely felt', zh: '几乎感觉不到', ko: '거의 느끼지 못함', vi: 'Hầu như không cảm nhận', ne: 'महसुस गर्न गाह्रो', easy_ja: 'きづかない ひとも いる' },
  '2': { ja: '室内で揺れを感じる', en: 'Felt indoors', zh: '室内有感', ko: '실내에서 느낌', vi: 'Cảm nhận trong nhà', ne: 'भित्र महसुस', easy_ja: 'へやで ゆれを かんじる' },
  '3': { ja: 'ほとんどの人が揺れを感じる', en: 'Felt by most', zh: '大多数人有感', ko: '대부분 느낌', vi: 'Hầu hết đều cảm nhận', ne: 'धेरैले महसुस गर्छन्', easy_ja: 'みんな ゆれを かんじる' },
  '4': { ja: '眠っている人も目を覚ます', en: 'Awakens sleepers', zh: '惊醒睡眠者', ko: '잠자는 사람도 깸', vi: 'Làm thức giấc', ne: 'सुतेकाहरू ब्युँझन्छन्', easy_ja: 'ねている ひとも おきる' },
  '5弱': { ja: '物につかまりたくなる', en: 'Hold on to something', zh: '想抓住东西', ko: '무엇인가 잡고 싶음', vi: 'Muốn bám vào gì đó', ne: 'केही समात्न मन लाग्छ', easy_ja: 'なにかに つかまりたい' },
  '5強': { ja: '立っていることが困難', en: 'Difficult to stand', zh: '难以站立', ko: '서 있기 어려움', vi: 'Khó đứng', ne: 'उभिन गाह्रो', easy_ja: 'たっていることが むずかしい' },
  '6弱': { ja: '立っていられない', en: "Can't stand", zh: '无法站立', ko: '서 있을 수 없음', vi: 'Không thể đứng', ne: 'उभिन असम्भव', easy_ja: 'たっていられない！' },
  '6強': { ja: '這わないと動けない', en: 'Must crawl', zh: '必须爬行', ko: '기어야 함', vi: 'Phải bò', ne: 'घस्रनु पर्छ', easy_ja: 'はわないと うごけない！' },
  '7': { ja: '投げ出される', en: 'Thrown around', zh: '被抛出', ko: '던져짐', vi: 'Bị ném', ne: 'फ्याँकिन्छ', easy_ja: 'からだが とばされる！' },
};

export default function IntensityGauge({ intensity, language, showLabel = true, size = 'md' }: IntensityGaugeProps) {
  const data = intensityData[intensity as keyof typeof intensityData] || intensityData['1'];
  const label = labels[intensity]?.[language] || labels[intensity]?.['en'] || intensity;
  const desc = descriptions[intensity]?.[language] || descriptions[intensity]?.['en'] || '';

  // サイズ設定
  const sizes = {
    sm: { gauge: 'h-3', container: 'w-32', text: 'text-sm', iconSize: 32 },
    md: { gauge: 'h-4', container: 'w-48', text: 'text-base', iconSize: 48 },
    lg: { gauge: 'h-6', container: 'w-64', text: 'text-lg', iconSize: 64 },
  };
  const s = sizes[size];

  // ゲージの幅（パーセント）
  const gaugeWidth = (data.level / 9) * 100;

  // 危険度アイコン
  const getDangerEmoji = (level: number) => {
    if (level >= 7) return '🚨';
    if (level >= 5) return '⚠️';
    if (level >= 3) return '📢';
    return '📊';
  };

  return (
    <div className="space-y-2">
      {/* メイン表示 */}
      <div className="flex items-center gap-3">
        {/* 震度アイコン */}
        <div
          className="flex items-center justify-center rounded-lg font-bold transition-transform hover:scale-105"
          style={{
            width: s.iconSize,
            height: s.iconSize,
            backgroundColor: data.color,
            border: `3px solid ${data.borderColor}`,
            color: data.textColor,
            fontSize: s.iconSize * 0.4,
          }}
          role="img"
          aria-label={label}
        >
          {intensity.replace('弱', '-').replace('強', '+')}
        </div>

        {/* ゲージとラベル */}
        <div className="flex-1">
          {showLabel && (
            <div className={`flex items-center gap-2 mb-1 ${s.text} font-medium`}>
              <span>{getDangerEmoji(data.level)}</span>
              <span>{label}</span>
            </div>
          )}

          {/* プログレスバー */}
          <div className={`relative ${s.container} bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${s.gauge}`}>
            <div
              className={`absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500`}
              style={{
                width: `${gaugeWidth}%`,
                backgroundColor: data.color,
              }}
            />
            {/* 区切り線 */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-white/50"
                style={{ left: `${(i / 9) * 100}%` }}
              />
            ))}
          </div>

          {/* 説明テキスト */}
          {desc && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{desc}</p>}
        </div>
      </div>
    </div>
  );
}

// コンパクト版（リスト用）
export function IntensityBadge({ intensity, language }: { intensity: string; language: string }) {
  const data = intensityData[intensity as keyof typeof intensityData] || intensityData['1'];

  return (
    <span
      className="inline-flex items-center justify-center px-2 py-1 rounded-md font-bold text-sm min-w-[48px]"
      style={{
        backgroundColor: data.color,
        border: `2px solid ${data.borderColor}`,
        color: data.textColor,
      }}
      role="img"
      aria-label={`Intensity ${intensity}`}
    >
      {intensity.replace('弱', '-').replace('強', '+')}
    </span>
  );
}

// 震度スケール全体表示（教育用）
export function IntensityScale({ currentIntensity, language }: { currentIntensity?: string; language: string }) {
  const allIntensities = ['1', '2', '3', '4', '5弱', '5強', '6弱', '6強', '7'];

  return (
    <div className="flex gap-1 items-end justify-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
      {allIntensities.map((i) => {
        const data = intensityData[i as keyof typeof intensityData];
        const isActive = i === currentIntensity;
        const height = 16 + (data.level * 4);

        return (
          <div
            key={i}
            className={`flex flex-col items-center transition-all duration-300 ${
              isActive ? 'scale-110' : 'opacity-70'
            }`}
          >
            <div
              className="rounded-t"
              style={{
                width: 20,
                height: height,
                backgroundColor: data.color,
                border: isActive ? `2px solid ${data.borderColor}` : 'none',
              }}
            />
            <span className="text-[8px] mt-1 text-gray-600 dark:text-gray-300">
              {i.replace('弱', '-').replace('強', '+')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
