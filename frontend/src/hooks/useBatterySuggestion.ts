'use client';

import { useCallback, useEffect, useState } from 'react';

/** これ未満の残量で低電力モードを提案する */
export const LOW_BATTERY_THRESHOLD = 0.2;

interface BatteryLike extends EventTarget {
  level: number;
}

type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryLike> };

/**
 * 電池残量が少ないときに低電力モードを**提案するだけ**（自動では切り替えない）。
 *
 * Battery Status API は Chromium 系のみ。iOS Safari・Firefox には無いので、
 * 無い環境では何もしない（提案が出ないだけで、手動のトグルは常に使える）。
 *
 * 「今はしない」で閉じたら、この画面を開いている間は再び出さない。
 */
export function useBatterySuggestion(lowPower: boolean) {
  const [lowBattery, setLowBattery] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithBattery) : null;
    if (!nav || typeof nav.getBattery !== 'function') return;

    let cancelled = false;
    let battery: BatteryLike | null = null;
    const update = () => {
      if (!cancelled && battery) setLowBattery(battery.level < LOW_BATTERY_THRESHOLD);
    };

    nav
      .getBattery()
      .then((b) => {
        if (cancelled) return;
        battery = b;
        update();
        b.addEventListener('levelchange', update);
      })
      .catch(() => {
        // 権限ポリシー等で拒否される環境もある。提案しないだけ
      });

    return () => {
      cancelled = true;
      battery?.removeEventListener('levelchange', update);
    };
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { suggest: lowBattery && !lowPower && !dismissed, dismiss };
}
