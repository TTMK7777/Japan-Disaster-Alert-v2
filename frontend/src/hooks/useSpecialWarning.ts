'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { hasActiveSpecialWarning } from '@/lib/specialWarning';
import { parseFailedAreas, readSwCache } from '@/lib/fetchFailure';

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
 * 取得に失敗したときは既知の特別警報を保つ。それ以外は未確認にする。
 * 圏外になった瞬間に帯が消えると「解除された」と読まれるため。
 * 地域を変えたら前の地域の判定は使わない（別地域の特別警報を今の地域のものとして出さない）。
 * **一部の予報区が取れなかった応答（partial）で、取れた分に特別警報が無いときも既知の特別警報を保ち、それ以外は未確認。**
 * 欠けた予報区（例: 宮古島）に特別警報が出ていたら、取れた本島の分だけで「なし」にすると帯が消える（B4a）。
 *
 * **特別警報ありと確認できていない地域で取れなかったら `unconfirmed`**（取得失敗・期限超過・SW のキャッシュ応答・
 * 取れた分に特別警報が無い一部欠落）。以前はここで active=false になるだけで、初回や地域変更直後に
 * 取れなかった利用者ほど「確認できていない」ことさえ分からなかった（Codex P1）。
 * 応答待ちの間は出さない（ちらつかせない）。地域の切替などで自分から中断した取得は失敗に数えない。
 *
 * effect の依存はプリミティブだけ（CLAUDE.md の規約）。
 */
export function useSpecialWarning({ prefCode, language, paused }: Options) {
  const [result, setResult] = useState<{ code: string; active: boolean } | null>(null);
  // 取得失敗・一部欠落の地域。既知の特別警報は残し、それ以外は未確認にする
  const [failedCode, setFailedCode] = useState<string | null>(null);
  // 最後に判定を得た地域と時刻。effect の再開時に「まだ新しいか」を見るだけなので state にしない
  const lastRef = useRef<{ code: string; at: number } | null>(null);

  const prefCodeRef = useRef(prefCode);
  prefCodeRef.current = prefCode;
  const reportFailure = useCallback((code: string) => {
    if (prefCodeRef.current === code) setFailedCode(code);
  }, []);

  const report = useCallback((code: string, alerts: unknown, options?: { partial?: boolean }) => {
    if (prefCodeRef.current !== code) return;
    lastRef.current = { code, at: Date.now() };
    const active = hasActiveSpecialWarning(alerts);
    // 一部欠落で「なし」は確定できない。既知の特別警報は保ち、それ以外は未確認にする
    if (options?.partial && !active) {
      setFailedCode(code);
      return;
    }
    setResult({ code, active });
    // 別の地域の結果で、今の地域の未確認を消さない
    setFailedCode((prev) => (prev === code ? null : prev));
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
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        current.abort();
      }, FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/alerts?area_code=${encodeURIComponent(prefCode)}&lang=${encodeURIComponent(languageRef.current)}`,
          { signal: current.signal }
        );
        if (!response.ok) throw new Error(`alerts ${response.status}`);
        // SW のキャッシュ応答で帯の判定を変えない（失敗と同じく前回の判定を保つ。B4b）
        if (readSwCache(response).fromCache) throw new Error('served from service worker cache');
        const data = await response.json();
        // 配列でない本文（{"detail": ...} 等）を「特別警報なし」にしない。形の異常は失敗（WarningBanner と同じ）
        if (!Array.isArray(data)) throw new Error('Unexpected alerts payload');
        if (cancelled) return;
        if (current.signal.aborted) {
          // 本文を読み終えた直後に期限が来た場合も失敗に数える（自前の中断だけを黙って捨てる）
          if (timedOut) reportFailure(prefCode);
          return;
        }
        report(prefCode, data, { partial: parseFailedAreas(response).length > 0 });
      } catch (err) {
        // 既知の特別警報を保つ。期限超過以外の中断は次の取得が進行中か、アンマウント
        if (cancelled || (current.signal.aborted && !timedOut)) return;
        console.warn('[special-warning] 取得に失敗:', err);
        reportFailure(prefCode);
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
  }, [prefCode, paused, report, reportFailure]);

  const decided = prefCode !== null && result !== null && result.code === prefCode;
  const active = decided && result.active;
  const unconfirmed = prefCode !== null && !active && failedCode === prefCode;
  return { active, unconfirmed, report, reportFailure };
}
