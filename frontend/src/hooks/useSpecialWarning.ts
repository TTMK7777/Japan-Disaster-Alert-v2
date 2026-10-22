'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { hasActiveSpecialWarning } from '@/lib/specialWarning';
import { parseFailedAreas } from '@/lib/fetchFailure';

/** 警報タブ（WarningBanner）と同じ 5 分間隔 */
export const SPECIAL_WARNING_POLL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

interface Options {
  /** 選択中の地域（府県予報区コード）。null なら取りに行かない */
  prefCode: string | null;
  language: string;
  /** 警報タブを開いている間は true。WarningBanner の取得結果を `report` で受け取る */
  paused: boolean;
}

/**
 * 選択中の地域に特別警報が出ているか（全タブ共通の帯）。
 *
 * 警報タブ以外にいても特別警報を見落とさないよう、ページ全体で `/api/v1/alerts` を 5 分ごとに取る。
 * 警報タブを開いている間は WarningBanner が同じ API を取るので止め、結果を `report` で受け取る。
 * タブを戻したときは**前回の取得から 5 分経つまで取り直さない**（同じ API の二重取得を避ける）。
 *
 * 取得に失敗したときは前回の判定を保つ。圏外になった瞬間に帯が消えると「解除された」と読まれるため。
 * 地域を変えたら前の地域の判定は使わない（別地域の特別警報を今の地域のものとして出さない）。
 * **一部の予報区が取れなかった応答（partial）で、取れた分に特別警報が無いときも前回の判定を保つ。**
 * 欠けた予報区（例: 宮古島）に特別警報が出ていたら、取れた本島の分だけで「なし」にすると帯が消える（B4a）。
 *
 * effect の依存はプリミティブだけ（CLAUDE.md の規約）。
 */
export function useSpecialWarning({ prefCode, language, paused }: Options) {
  const [result, setResult] = useState<{ code: string; active: boolean } | null>(null);
  // 最後に判定を得た地域と時刻。effect の再開時に「まだ新しいか」を見るだけなので state にしない
  const lastRef = useRef<{ code: string; at: number } | null>(null);

  const report = useCallback((code: string, alerts: unknown, options?: { partial?: boolean }) => {
    lastRef.current = { code, at: Date.now() };
    const active = hasActiveSpecialWarning(alerts);
    // 一部欠落で「なし」は確定できない。前回の判定（同じ地域なら）を保つ
    if (options?.partial && !active) return;
    setResult({ code, active });
  }, []);

  // 言語は API のクエリにだけ使う（判定は言語に依存しない）。言語の変更で取り直さないよう ref で持つ
  const languageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    if (!prefCode || paused) return;
    let cancelled = false;
    let controller: AbortController | null = null;

    const run = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const timeoutId = setTimeout(() => current.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/alerts?area_code=${encodeURIComponent(prefCode)}&lang=${encodeURIComponent(languageRef.current)}`,
          { signal: current.signal }
        );
        if (!response.ok) throw new Error(`alerts ${response.status}`);
        const data = await response.json();
        if (cancelled || current.signal.aborted) return;
        report(prefCode, data, { partial: parseFailedAreas(response).length > 0 });
      } catch (err) {
        // 失敗は前回の判定を保つ（上のコメント）。中断は次の取得が進行中か、アンマウント
        if (!current.signal.aborted) console.warn('[special-warning] 取得に失敗:', err);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const last = lastRef.current;
    const delay = last && last.code === prefCode ? Math.max(0, last.at + SPECIAL_WARNING_POLL_MS - Date.now()) : 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      run();
      interval = setInterval(run, SPECIAL_WARNING_POLL_MS);
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(first);
      if (interval !== undefined) clearInterval(interval);
      controller?.abort();
    };
  }, [prefCode, paused, report]);

  const active = prefCode !== null && result !== null && result.code === prefCode && result.active;
  return { active, report };
}
