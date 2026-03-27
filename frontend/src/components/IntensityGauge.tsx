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
  '1': { ja: '震度1', en: 'Weak', zh: '震度1', 'zh-TW': '震度1', ko: '진도1', vi: 'Cấp 1', th: 'ระดับ 1', id: 'Tingkat 1', ms: 'Tahap 1', tl: 'Antas 1', ne: '१', fr: 'Niveau 1', de: 'Stufe 1', it: 'Livello 1', es: 'Nivel 1', easy_ja: 'しんど1' },
  '2': { ja: '震度2', en: 'Light', zh: '震度2', 'zh-TW': '震度2', ko: '진도2', vi: 'Cấp 2', th: 'ระดับ 2', id: 'Tingkat 2', ms: 'Tahap 2', tl: 'Antas 2', ne: '२', fr: 'Niveau 2', de: 'Stufe 2', it: 'Livello 2', es: 'Nivel 2', easy_ja: 'しんど2' },
  '3': { ja: '震度3', en: 'Moderate', zh: '震度3', 'zh-TW': '震度3', ko: '진도3', vi: 'Cấp 3', th: 'ระดับ 3', id: 'Tingkat 3', ms: 'Tahap 3', tl: 'Antas 3', ne: '३', fr: 'Niveau 3', de: 'Stufe 3', it: 'Livello 3', es: 'Nivel 3', easy_ja: 'しんど3' },
  '4': { ja: '震度4', en: 'Strong', zh: '震度4', 'zh-TW': '震度4', ko: '진도4', vi: 'Cấp 4', th: 'ระดับ 4', id: 'Tingkat 4', ms: 'Tahap 4', tl: 'Antas 4', ne: '४', fr: 'Niveau 4', de: 'Stufe 4', it: 'Livello 4', es: 'Nivel 4', easy_ja: 'しんど4' },
  '5弱': { ja: '震度5弱', en: 'Very Strong', zh: '震度5弱', 'zh-TW': '震度5弱', ko: '진도5약', vi: 'Cấp 5-', th: 'ระดับ 5-', id: 'Tingkat 5-', ms: 'Tahap 5-', tl: 'Antas 5-', ne: '५-', fr: 'Niveau 5-', de: 'Stufe 5-', it: 'Livello 5-', es: 'Nivel 5-', easy_ja: 'しんど5よわい' },
  '5強': { ja: '震度5強', en: 'Very Strong+', zh: '震度5强', 'zh-TW': '震度5強', ko: '진도5강', vi: 'Cấp 5+', th: 'ระดับ 5+', id: 'Tingkat 5+', ms: 'Tahap 5+', tl: 'Antas 5+', ne: '५+', fr: 'Niveau 5+', de: 'Stufe 5+', it: 'Livello 5+', es: 'Nivel 5+', easy_ja: 'しんど5つよい' },
  '6弱': { ja: '震度6弱', en: 'Severe', zh: '震度6弱', 'zh-TW': '震度6弱', ko: '진도6약', vi: 'Cấp 6-', th: 'ระดับ 6-', id: 'Tingkat 6-', ms: 'Tahap 6-', tl: 'Antas 6-', ne: '६-', fr: 'Niveau 6-', de: 'Stufe 6-', it: 'Livello 6-', es: 'Nivel 6-', easy_ja: 'しんど6よわい' },
  '6強': { ja: '震度6強', en: 'Severe+', zh: '震度6强', 'zh-TW': '震度6強', ko: '진도6강', vi: 'Cấp 6+', th: 'ระดับ 6+', id: 'Tingkat 6+', ms: 'Tahap 6+', tl: 'Antas 6+', ne: '६+', fr: 'Niveau 6+', de: 'Stufe 6+', it: 'Livello 6+', es: 'Nivel 6+', easy_ja: 'しんど6つよい' },
  '7': { ja: '震度7', en: 'Violent', zh: '震度7', 'zh-TW': '震度7', ko: '진도7', vi: 'Cấp 7', th: 'ระดับ 7', id: 'Tingkat 7', ms: 'Tahap 7', tl: 'Antas 7', ne: '७', fr: 'Niveau 7', de: 'Stufe 7', it: 'Livello 7', es: 'Nivel 7', easy_ja: 'しんど7' },
};

// 震度の説明（直感的な行動指示）
const descriptions: Record<string, Record<string, string>> = {
  '1': { ja: '気づかない人も', en: 'Barely felt', zh: '几乎感觉不到', 'zh-TW': '幾乎感覺不到', ko: '거의 느끼지 못함', vi: 'Hầu như không cảm nhận', th: 'แทบไม่รู้สึก', id: 'Hampir tidak terasa', ms: 'Hampir tidak terasa', tl: 'Halos hindi naramdaman', ne: 'महसुस गर्न गाह्रो', fr: '\u00c0 peine ressenti', de: 'Kaum sp\u00fcrbar', it: 'Appena percepito', es: 'Apenas perceptible', easy_ja: 'きづかない ひとも いる' },
  '2': { ja: '室内で揺れを感じる', en: 'Felt indoors', zh: '室内有感', 'zh-TW': '室內有感', ko: '실내에서 느낌', vi: 'Cảm nhận trong nhà', th: 'รู้สึกได้ในอาคาร', id: 'Terasa di dalam ruangan', ms: 'Terasa di dalam bangunan', tl: 'Naramdaman sa loob', ne: 'भित्र महसुस', fr: 'Ressenti \u00e0 l\'int\u00e9rieur', de: 'Im Geb\u00e4ude sp\u00fcrbar', it: 'Percepito al chiuso', es: 'Sentido en interiores', easy_ja: 'へやで ゆれを かんじる' },
  '3': { ja: 'ほとんどの人が揺れを感じる', en: 'Felt by most', zh: '大多数人有感', 'zh-TW': '大多數人有感', ko: '대부분 느낌', vi: 'Hầu hết đều cảm nhận', th: 'คนส่วนใหญ่รู้สึกได้', id: 'Dirasakan sebagian besar', ms: 'Dirasai kebanyakan orang', tl: 'Naramdaman ng karamihan', ne: 'धेरैले महसुस गर्छन्', fr: 'Ressenti par la plupart', de: 'Von den meisten gesp\u00fcrt', it: 'Percepito dalla maggioranza', es: 'Sentido por la mayor\u00eda', easy_ja: 'みんな ゆれを かんじる' },
  '4': { ja: '眠っている人も目を覚ます', en: 'Awakens sleepers', zh: '惊醒睡眠者', 'zh-TW': '驚醒睡眠者', ko: '잠자는 사람도 깸', vi: 'Làm thức giấc', th: 'ปลุกคนนอนหลับ', id: 'Membangunkan yang tidur', ms: 'Kejutkan orang tidur', tl: 'Ginigising ang natutulog', ne: 'सुतेकाहरू ब्युँझन्छन्', fr: 'R\u00e9veille les dormeurs', de: 'Weckt Schlafende', it: 'Sveglia chi dorme', es: 'Despierta a los dormidos', easy_ja: 'ねている ひとも おきる' },
  '5弱': { ja: '物につかまりたくなる', en: 'Hold on to something', zh: '想抓住东西', 'zh-TW': '想抓住東西', ko: '무엇인가 잡고 싶음', vi: 'Muốn bám vào gì đó', th: 'อยากจับยึดสิ่งของ', id: 'Ingin berpegangan', ms: 'Mahu berpegang pada sesuatu', tl: 'Gusto humawak ng kung ano', ne: 'केही समात्न मन लाग्छ', fr: 'Besoin de s\'agripper', de: 'Festhalten n\u00f6tig', it: 'Bisogno di aggrapparsi', es: 'Necesidad de agarrarse', easy_ja: 'なにかに つかまりたい' },
  '5強': { ja: '立っていることが困難', en: 'Difficult to stand', zh: '难以站立', 'zh-TW': '難以站立', ko: '서 있기 어려움', vi: 'Khó đứng', th: 'ยืนได้ยาก', id: 'Sulit berdiri', ms: 'Sukar berdiri', tl: 'Mahirap tumayo', ne: 'उभिन गाह्रो', fr: 'Difficile de rester debout', de: 'Stehen ist schwierig', it: 'Difficile stare in piedi', es: 'Dif\u00edcil mantenerse en pie', easy_ja: 'たっていることが むずかしい' },
  '6弱': { ja: '立っていられない', en: "Can't stand", zh: '无法站立', 'zh-TW': '無法站立', ko: '서 있을 수 없음', vi: 'Không thể đứng', th: 'ยืนไม่ได้', id: 'Tidak bisa berdiri', ms: 'Tidak boleh berdiri', tl: 'Hindi makatayo', ne: 'उभिन असम्भव', fr: 'Impossible de se tenir debout', de: 'Kann nicht stehen', it: 'Impossibile stare in piedi', es: 'Imposible mantenerse en pie', easy_ja: 'たっていられない！' },
  '6強': { ja: '這わないと動けない', en: 'Must crawl', zh: '必须爬行', 'zh-TW': '必須爬行', ko: '기어야 함', vi: 'Phải bò', th: 'ต้องคลาน', id: 'Harus merangkak', ms: 'Perlu merangkak', tl: 'Kailangang gumapang', ne: 'घस्रनु पर्छ', fr: 'Ramper pour se d\u00e9placer', de: 'Kriechen erforderlich', it: 'Bisogna strisciare', es: 'Hay que arrastrarse', easy_ja: 'はわないと うごけない！' },
  '7': { ja: '投げ出される', en: 'Thrown around', zh: '被抛出', 'zh-TW': '被拋出', ko: '던져짐', vi: 'Bị ném', th: 'ถูกเหวี่ยง', id: 'Terlempar', ms: 'Dilontarkan', tl: 'Tinatapunan', ne: 'फ्याँकिन्छ', fr: 'Projet\u00e9', de: 'Umhergeworfen', it: 'Sbalzato', es: 'Lanzado', easy_ja: 'からだが とばされる！' },
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
