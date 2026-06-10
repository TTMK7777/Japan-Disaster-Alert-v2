'use client';

import React from 'react';
import { getTranslation } from '@/i18n/translations';

interface ConnectionStatusProps {
  mode: 'sse' | 'polling' | 'disconnected';
  connected: boolean;
  language: string;
}

// 接続モード -> 中央翻訳テーブル（src/i18n/translations.ts）のキー
const MODE_KEYS: Record<ConnectionStatusProps['mode'], string> = {
  sse: 'realtime',
  polling: 'polling',
  disconnected: 'disconnected',
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

  const label = getTranslation(language, MODE_KEYS[mode]);

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
