'use client';

import React from 'react';
import { getTranslation, getLocale } from '@/i18n/translations';
import ConnectionStatus from './ConnectionStatus';

/**
 * 低電力・低回線モードの操作部と「最後に取得できた時刻」の表示。
 *
 * 色は操作系（白・灰・青）だけを使う。警報の赤（red-700）・特別警報の紫（purple-800）と
 * 混ざらないようにするため（デザイン: .team/inbox/CDX/b10-b3/low-power.md）。
 */

function formatClock(epochMs: number, language: string): string {
  return new Date(epochMs).toLocaleTimeString(getLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BatteryIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="6" y="4" width="12" height="18" rx="2" />
      <path d="M10 2h4" strokeLinecap="round" />
      <path d="M9 16c3 0 6-2 6-7-4 0-6 3-6 7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface LowPowerToggleProps {
  enabled: boolean;
  onToggle: () => void;
  language: string;
}

/** ヘッダーに置くトグル（どのタブからも 1 タップ） */
export function LowPowerToggle({ enabled, onToggle, language }: LowPowerToggleProps) {
  const label = getTranslation(language, 'lowPower.label');
  const state = getTranslation(language, enabled ? 'lowPower.on' : 'lowPower.off');
  return (
    <button
      id="low-power-toggle"
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={label}
      title={`${label}: ${state}`}
      className={`flex items-center justify-center gap-1 p-2 min-h-[44px] min-w-[44px] rounded-lg border text-sm font-medium transition-colors ${
        enabled
          ? 'bg-white text-blue-700 border-white'
          : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
      }`}
    >
      <BatteryIcon />
      <span className="hidden sm:inline">{state}</span>
    </button>
  );
}

interface FreshnessStatusProps {
  language: string;
  lastSuccessAt: number | null;
  lastFailed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  lowPower: boolean;
  nextPollAt: number | null;
  mode: 'sse' | 'polling' | 'disconnected';
  connected: boolean;
}

/**
 * 接続状態・最後に取得できた時刻・「今すぐ更新」。全タブ共通で本文の先頭に出す。
 *
 * - 一度も取れていなければ「未取得」
 * - 失敗したら成功時刻はそのまま、「更新に失敗。前の情報を表示中」を足す
 * - 「今すぐ更新」は取得中は押せない
 */
export function FreshnessStatus({
  language,
  lastSuccessAt,
  lastFailed,
  refreshing,
  onRefresh,
  lowPower,
  nextPollAt,
  mode,
  connected,
}: FreshnessStatusProps) {
  const t = (key: string) => getTranslation(language, key);

  return (
    <div className="mb-4 space-y-2 text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <ConnectionStatus mode={mode} connected={connected} language={language} />
        <span aria-hidden="true">·</span>
        <span data-testid="last-success" suppressHydrationWarning>
          {t('freshness.lastFetched')}:{' '}
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            {lastSuccessAt === null ? t('freshness.never') : formatClock(lastSuccessAt, language)}
          </span>
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-blue-600 text-blue-700 bg-white hover:bg-blue-50 dark:bg-gray-800 dark:text-blue-300 dark:border-blue-400 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-wait focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
          </svg>
          {refreshing ? t('freshness.refreshing') : t('freshness.refresh')}
        </button>
      </div>

      {lastFailed && (
        <p
          data-testid="fetch-failed"
          className="flex items-center justify-end gap-1 text-gray-800 dark:text-gray-100 font-medium"
        >
          <span aria-hidden="true">!</span>
          {lastSuccessAt === null ? t('freshness.failedNever') : t('freshness.failed')}
        </p>
      )}

      {lowPower && (
        <div
          data-testid="low-power-info"
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-1"
        >
          <p className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
            <span className="text-blue-700 dark:text-blue-300"><BatteryIcon /></span>
            {t('lowPower.label')}: {t('lowPower.on')}
          </p>
          <p>{t('lowPower.description')}</p>
          {nextPollAt !== null && (
            <p data-testid="next-poll">
              {t('freshness.nextUpdate')}:{' '}
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                {formatClock(nextPollAt, language)}
              </span>
            </p>
          )}
          <p>{t('lowPower.delayNote')}</p>
          <p className="text-xs">{t('lowPower.notifyNote')}</p>
        </div>
      )}
    </div>
  );
}

interface BatterySuggestionProps {
  language: string;
  onAccept: () => void;
  onDismiss: () => void;
}

/** 電池残量が少ないときの提案（押されるまで切り替えない） */
export function BatterySuggestion({ language, onAccept, onDismiss }: BatterySuggestionProps) {
  const t = (key: string) => getTranslation(language, key);
  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-gray-800 p-3 text-sm text-gray-900 dark:text-gray-100 flex flex-wrap items-center gap-2"
    >
      <span className="text-blue-700 dark:text-blue-300"><BatteryIcon /></span>
      <span className="flex-1 min-w-[12rem]">{t('lowPower.batterySuggest')}</span>
      <button
        type="button"
        onClick={onAccept}
        className="px-3 py-1.5 min-h-[36px] rounded-lg bg-blue-700 text-white font-medium hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {t('lowPower.turnOn')}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="px-3 py-1.5 min-h-[36px] rounded-lg border border-gray-300 dark:border-gray-600 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {t('lowPower.notNow')}
      </button>
    </div>
  );
}
