'use client';

import React from 'react';

interface ConnectionStatusProps {
  mode: 'sse' | 'polling' | 'disconnected';
  connected: boolean;
  language: string;
}

// 接続状態の多言語ラベル
const statusLabels: Record<string, Record<string, string>> = {
  sse: {
    ja: 'リアルタイム',
    en: 'Real-time',
    zh: '实时',
    'zh-TW': '即時',
    ko: '실시간',
    vi: 'Thời gian thực',
    th: 'เรียลไทม์',
    id: 'Real-time',
    ms: 'Masa nyata',
    tl: 'Real-time',
    ne: 'रियल-टाइम',
    fr: 'Temps r\u00e9el',
    de: 'Echtzeit',
    it: 'Tempo reale',
    es: 'Tiempo real',
    easy_ja: 'リアルタイム',
  },
  polling: {
    ja: '定期更新',
    en: 'Periodic',
    zh: '定期更新',
    'zh-TW': '定期更新',
    ko: '주기적 업데이트',
    vi: 'C\u1eadp nh\u1eadt \u0111\u1ecbnh k\u1ef3',
    th: 'อัปเดตเป็นระยะ',
    id: 'Pembaruan berkala',
    ms: 'Kemas kini berkala',
    tl: 'Pana-panahon',
    ne: 'आवधिक अद्यावधिक',
    fr: 'P\u00e9riodique',
    de: 'Periodisch',
    it: 'Periodico',
    es: 'Peri\u00f3dico',
    easy_ja: 'ていき こうしん',
  },
  disconnected: {
    ja: '切断',
    en: 'Disconnected',
    zh: '已断开',
    'zh-TW': '已斷開',
    ko: '연결 끊김',
    vi: 'M\u1ea5t k\u1ebft n\u1ed1i',
    th: 'ขาดการเชื่อมต่อ',
    id: 'Terputus',
    ms: 'Terputus',
    tl: 'Naka-disconnect',
    ne: 'विच\u094dछेद',
    fr: 'D\u00e9connect\u00e9',
    de: 'Getrennt',
    it: 'Disconnesso',
    es: 'Desconectado',
    easy_ja: 'せつだん',
  },
};

/**
 * SSE/ポーリング/切断の接続状態を小さなインジケーターで表示するコンポーネント
 */
export default function ConnectionStatus({ mode, connected, language }: ConnectionStatusProps) {
  // ステータスに応じたスタイル
  const dotColor =
    mode === 'sse' && connected
      ? 'bg-green-500'
      : mode === 'polling'
        ? 'bg-yellow-500'
        : 'bg-red-500';

  const shouldPulse = mode === 'sse' && connected;

  // 言語に応じたラベル（ja/en以外はenにフォールバック）
  const label = statusLabels[mode]?.[language] || statusLabels[mode]?.['en'] || mode;

  return (
    <div
      className="inline-flex items-center gap-1.5"
      role="status"
      aria-label={label}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${dotColor} ${shouldPulse ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      <span className="text-xs text-white/80">{label}</span>
    </div>
  );
}
