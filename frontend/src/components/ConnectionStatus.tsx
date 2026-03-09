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
  },
  polling: {
    ja: '定期更新',
    en: 'Periodic',
  },
  disconnected: {
    ja: '切断',
    en: 'Disconnected',
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
