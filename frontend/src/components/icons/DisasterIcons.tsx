'use client';

import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

// 地震アイコン（波形デザイン）
export function EarthquakeIcon({ size = 24, className = '', animate = false }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`${className} ${animate ? 'animate-shake' : ''}`}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="22" fill="#FF6B35" stroke="#D63A00" strokeWidth="2" />
      {/* 波形 */}
      <path
        d="M10 24 L14 18 L18 30 L22 14 L26 34 L30 18 L34 28 L38 24"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 津波アイコン（波と矢印）
export function TsunamiIcon({ size = 24, className = '', animate = false }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`${className} ${animate ? 'animate-wave' : ''}`}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="22" fill="#1E40AF" stroke="#1E3A8A" strokeWidth="2" />
      {/* 大波 */}
      <path
        d="M8 28 Q12 20 16 28 Q20 36 24 28 Q28 20 32 28 Q36 36 40 28"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* 小波 */}
      <path
        d="M12 36 Q16 32 20 36 Q24 40 28 36 Q32 32 36 36"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* 上矢印（避難を示す） */}
      <path
        d="M24 10 L28 16 L25 16 L25 22 L23 22 L23 16 L20 16 Z"
        fill="white"
      />
    </svg>
  );
}

// 避難所アイコン（人と家）
export function ShelterIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="22" fill="#16A34A" stroke="#15803D" strokeWidth="2" />
      {/* 屋根 */}
      <path d="M24 10 L38 24 L34 24 L34 36 L14 36 L14 24 L10 24 Z" fill="white" />
      {/* 人のシルエット */}
      <circle cx="24" cy="22" r="4" fill="#16A34A" />
      <path d="M20 28 L28 28 L28 34 L20 34 Z" fill="#16A34A" />
    </svg>
  );
}

// 警報アイコン（三角形に！）
export function AlertIcon({ size = 24, className = '', level = 'warning' }: IconProps & { level?: 'advisory' | 'warning' | 'emergency' }) {
  const colors = {
    advisory: { bg: '#FCD34D', border: '#F59E0B', text: '#92400E' },
    warning: { bg: '#FB923C', border: '#EA580C', text: 'white' },
    emergency: { bg: '#EF4444', border: '#DC2626', text: 'white' },
  };
  const c = colors[level];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M24 4 L46 42 L2 42 Z"
        fill={c.bg}
        stroke={c.border}
        strokeWidth="2"
      />
      <text
        x="24"
        y="36"
        textAnchor="middle"
        fontSize="24"
        fontWeight="bold"
        fill={c.text}
      >
        !
      </text>
    </svg>
  );
}

// 安全アイコン（チェックマーク）
export function SafeIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="22" fill="#22C55E" stroke="#16A34A" strokeWidth="2" />
      <path
        d="M14 24 L20 30 L34 16"
        fill="none"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 震度表示用アイコン（数字入り円）
export function IntensityIcon({ intensity, size = 48 }: { intensity: string; size?: number }) {
  const getColors = (i: string) => {
    const colorMap: Record<string, { bg: string; border: string; text: string }> = {
      '1': { bg: '#F3F4F6', border: '#9CA3AF', text: '#374151' },
      '2': { bg: '#60A5FA', border: '#3B82F6', text: 'white' },
      '3': { bg: '#3B82F6', border: '#2563EB', text: 'white' },
      '4': { bg: '#FDE047', border: '#FACC15', text: '#374151' },
      '5弱': { bg: '#FCD34D', border: '#F59E0B', text: '#374151' },
      '5強': { bg: '#FB923C', border: '#EA580C', text: 'white' },
      '6弱': { bg: '#F87171', border: '#EF4444', text: 'white' },
      '6強': { bg: '#DC2626', border: '#B91C1C', text: 'white' },
      '7': { bg: '#9333EA', border: '#7C3AED', text: 'white' },
    };
    return colorMap[i] || { bg: '#9CA3AF', border: '#6B7280', text: 'white' };
  };

  const c = getColors(intensity);
  const displayText = intensity.replace('弱', '-').replace('強', '+');

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label={`Intensity ${intensity}`}>
      <circle cx="24" cy="24" r="22" fill={c.bg} stroke={c.border} strokeWidth="2" />
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fontSize={displayText.length > 1 ? '16' : '24'}
        fontWeight="bold"
        fill={c.text}
      >
        {displayText}
      </text>
    </svg>
  );
}

// マグニチュード表示アイコン
export function MagnitudeIcon({ magnitude, size = 48 }: { magnitude: number; size?: number }) {
  // マグニチュードに応じた色
  const getColor = (m: number) => {
    if (m >= 7) return { bg: '#DC2626', border: '#B91C1C', text: 'white' };
    if (m >= 6) return { bg: '#EA580C', border: '#C2410C', text: 'white' };
    if (m >= 5) return { bg: '#F59E0B', border: '#D97706', text: 'white' };
    if (m >= 4) return { bg: '#FDE047', border: '#FACC15', text: '#374151' };
    return { bg: '#E5E7EB', border: '#9CA3AF', text: '#374151' };
  };

  const c = getColor(magnitude);

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label={`Magnitude ${magnitude}`}>
      <rect x="4" y="4" width="40" height="40" rx="8" fill={c.bg} stroke={c.border} strokeWidth="2" />
      <text x="10" y="20" fontSize="10" fill={c.text} fontWeight="bold">M</text>
      <text x="24" y="34" textAnchor="middle" fontSize="18" fontWeight="bold" fill={c.text}>
        {magnitude.toFixed(1)}
      </text>
    </svg>
  );
}

// 深さ表示アイコン
export function DepthIcon({ depth, size = 48 }: { depth: number; size?: number }) {
  const getColor = (d: number) => {
    if (d <= 10) return { bg: '#FEE2E2', border: '#F87171', text: '#B91C1C' };
    if (d <= 30) return { bg: '#FEF3C7', border: '#FBBF24', text: '#92400E' };
    if (d <= 100) return { bg: '#DBEAFE', border: '#60A5FA', text: '#1E40AF' };
    return { bg: '#E0E7FF', border: '#818CF8', text: '#3730A3' };
  };

  const c = getColor(depth);

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label={`Depth ${depth}km`}>
      <rect x="4" y="4" width="40" height="40" rx="8" fill={c.bg} stroke={c.border} strokeWidth="2" />
      {/* 下向き矢印 */}
      <path d="M24 10 L24 26 M18 20 L24 26 L30 20" stroke={c.text} strokeWidth="2" fill="none" />
      <text x="24" y="40" textAnchor="middle" fontSize="10" fontWeight="bold" fill={c.text}>
        {depth}km
      </text>
    </svg>
  );
}

// 時計アイコン（発生時刻用）
export function TimeIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// 位置アイコン
export function LocationIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

export default {
  EarthquakeIcon,
  TsunamiIcon,
  ShelterIcon,
  AlertIcon,
  SafeIcon,
  IntensityIcon,
  MagnitudeIcon,
  DepthIcon,
  TimeIcon,
  LocationIcon,
};
