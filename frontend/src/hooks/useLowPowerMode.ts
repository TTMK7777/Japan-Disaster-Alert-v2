'use client';

import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage } from '@/lib/safeStorage';

export const LOW_POWER_STORAGE_KEY = 'disaster-app-low-power';

// 保存の読み書きは例外を外に出さない（lib/safeStorage）。ストレージが拒否された端末でも
// 画面は落とさず、トグルはその画面の間だけ効く
function readStored(): boolean {
  return readStorage(LOW_POWER_STORAGE_KEY) === '1';
}

function writeStored(value: boolean): void {
  writeStorage(LOW_POWER_STORAGE_KEY, value ? '1' : '0');
}

/**
 * 低電力・低回線モードのオン／オフ（端末に保存）。
 *
 * SSR と初回描画はオフ。保存値はマウント後に読む（hydration mismatch を避ける）。
 * 保存は「読み込み完了後に値が変わったとき」だけ行う。読み込み前の既定値（オフ）で
 * 保存済みのオンを上書きしないため。
 */
export function useLowPowerMode() {
  const [lowPower, setLowPowerState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // 注意: 保存エフェクトより先に宣言する（useDisplayPreferences と同じ理由）
  useEffect(() => {
    setLowPowerState(readStored());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) writeStored(lowPower);
  }, [lowPower, loaded]);

  const setLowPower = useCallback((value: boolean) => {
    setLowPowerState(value);
  }, []);

  const toggleLowPower = useCallback(() => {
    setLowPowerState((prev) => !prev);
  }, []);

  return { lowPower, setLowPower, toggleLowPower };
}
