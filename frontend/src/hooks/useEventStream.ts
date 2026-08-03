'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE_URL } from '@/config/api';

// HIGH #3/#4: lang パラメータのバリデーション
const VALID_LANGS = new Set(['ja','en','zh','zh-TW','ko','vi','th','id','ms','tl','fr','de','it','es','ne','easy_ja']);

function sanitizeLang(lang: string): string {
  return VALID_LANGS.has(lang) ? lang : 'ja';
}

// SSEイベントデータの型定義
interface EarthquakeEventData {
  earthquakes: any[];
  updated_at: string;
}

interface TsunamiEventData {
  tsunamis: any[];
  updated_at: string;
}

interface HeartbeatEventData {
  time: string;
  clients: number;
}

interface EventStreamOptions {
  lang: string;
  onEarthquake?: (data: EarthquakeEventData) => void;
  onTsunami?: (data: TsunamiEventData) => void;
  onHeartbeat?: (data: HeartbeatEventData) => void;
  /** ポーリングフォールバックの間隔（ミリ秒、デフォルト: 30000） */
  fallbackInterval?: number;
  enabled?: boolean;
}

interface EventStreamState {
  connected: boolean;
  mode: 'sse' | 'polling' | 'disconnected';
  lastEvent: string | null;
}

/** ポーリング間隔の上限。連続失敗のたびに倍にして、ここで頭打ちにする */
const MAX_POLL_INTERVAL_MS = 300000; // 5分

/**
 * いま通信する意味があるか。
 *
 * 圏外・停電（＝このアプリが最も要る場面）では、投げても何も返ってこない。
 * それでも 30 秒ごとに fetch し続けると、得る情報ゼロで電池だけを削る。
 * 画面を見ていないとき（バックグラウンド）も同じ。
 *
 * `navigator.onLine` は「繋がっている」ことは保証しないが、
 * **`false` のときは確実に繋がっていない**ので、その判定にだけ使う。
 */
function canReachNetwork(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  return true;
}

/**
 * SSEによるリアルタイムイベントストリーム接続フック
 *
 * SSE接続に失敗した場合、自動的にポーリングフォールバックに切り替える。
 * 指数バックオフ付きの自動再接続を行い、最大5回再試行後にポーリングへ移行する。
 */
export function useEventStream(options: EventStreamOptions): EventStreamState {
  const {
    lang,
    onEarthquake,
    onTsunami,
    onHeartbeat,
    fallbackInterval = 30000,
    enabled = true,
  } = options;

  const [state, setState] = useState<EventStreamState>({
    connected: false,
    mode: 'disconnected',
    lastEvent: null,
  });

  // コールバックの最新値を保持するref
  const callbacksRef = useRef({ onEarthquake, onTsunami, onHeartbeat });
  callbacksRef.current = { onEarthquake, onTsunami, onHeartbeat };

  // HIGH #1: connect関数の最新版を保持するref（stale closure回避）
  const connectRef = useRef<(() => void) | null>(null);

  // HIGH #2: アンマウント後のsetState防止
  const isMountedRef = useRef(true);

  // 再接続試行回数
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // タイマー・EventSourceの参照
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ポーリングの連続失敗回数（間隔を伸ばすために使う）
  const pollFailuresRef = useRef(0);

  // ポーリング停止
  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  // ポーリングフォールバック: 既存のfetch方式で地震データを取得
  //
  // 一定間隔の setInterval ではなく、1回ごとに次を予約する形にしてある。
  // 失敗が続くほど間隔を伸ばし（30s → 60s → … 最大5分）、
  // 圏外・バックグラウンドでは**次を予約せずに止まる**ため。
  // 再開は online / visibilitychange のリスナが行う。
  const startPolling = useCallback(() => {
    stopPolling();

    setState((prev) => ({ ...prev, mode: 'polling', connected: false }));

    const scheduleNext = () => {
      if (!isMountedRef.current) return;
      // 2^4 で頭打ち。上限は MAX_POLL_INTERVAL_MS
      const backoff = Math.pow(2, Math.min(pollFailuresRef.current, 4));
      const delay = Math.min(fallbackInterval * backoff, MAX_POLL_INTERVAL_MS);
      pollingTimerRef.current = setTimeout(poll, delay);
    };

    const poll = async () => {
      if (!isMountedRef.current) return;

      if (!canReachNetwork()) {
        // 次を予約しない＝ここで止まる。復帰時にリスナが呼び直す
        setState((prev) => ({ ...prev, mode: 'disconnected', connected: false }));
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(
          `${API_BASE_URL}/api/v1/earthquakes?lang=${sanitizeLang(lang)}&limit=20`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!isMountedRef.current) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        pollFailuresRef.current = 0;
        callbacksRef.current.onEarthquake?.({
          earthquakes: data,
          updated_at: new Date().toISOString(),
        });
        setState((prev) => ({
          ...prev,
          mode: 'polling',
          lastEvent: new Date().toISOString(),
        }));
      } catch (err) {
        pollFailuresRef.current += 1;
        console.error('[EventStream] ポーリングエラー:', err);
      } finally {
        scheduleNext();
      }
    };

    poll();
  }, [lang, fallbackInterval, stopPolling]);

  // SSE接続を確立
  const connect = useCallback(() => {
    // 既存の接続をクリーンアップ
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // 再接続タイマーをクリア
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // 圏外・バックグラウンドでは接続しない。
    // EventSource は自前でも再接続を試みるため、開いた時点で通信が始まってしまう
    if (!canReachNetwork()) {
      stopPolling();
      setState({ connected: false, mode: 'disconnected', lastEvent: null });
      return;
    }

    try {
      const url = `${API_BASE_URL}/api/v1/events/stream?lang=${sanitizeLang(lang)}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // 接続成功
      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;
        stopPolling();
        setState({
          connected: true,
          mode: 'sse',
          lastEvent: null,
        });
      };

      // 地震イベント
      eventSource.addEventListener('earthquake', (event: MessageEvent) => {
        try {
          const data: EarthquakeEventData = JSON.parse(event.data);
          callbacksRef.current.onEarthquake?.(data);
          setState((prev) => ({
            ...prev,
            lastEvent: new Date().toISOString(),
          }));
        } catch (err) {
          console.error('[EventStream] 地震イベントのパースエラー:', err);
        }
      });

      // 津波イベント
      eventSource.addEventListener('tsunami', (event: MessageEvent) => {
        try {
          const data: TsunamiEventData = JSON.parse(event.data);
          callbacksRef.current.onTsunami?.(data);
          setState((prev) => ({
            ...prev,
            lastEvent: new Date().toISOString(),
          }));
        } catch (err) {
          console.error('[EventStream] 津波イベントのパースエラー:', err);
        }
      });

      // ハートビートイベント
      eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
        try {
          const data: HeartbeatEventData = JSON.parse(event.data);
          callbacksRef.current.onHeartbeat?.(data);
          setState((prev) => ({
            ...prev,
            lastEvent: new Date().toISOString(),
          }));
        } catch (err) {
          console.error('[EventStream] ハートビートのパースエラー:', err);
        }
      });

      // エラーハンドリング: 指数バックオフで再接続
      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;

        setState((prev) => ({
          ...prev,
          connected: false,
        }));

        // 圏外・バックグラウンドなら再接続もポーリングもしない。
        // 復帰時に online / visibilitychange のリスナが呼び直す
        if (!canReachNetwork()) {
          stopPolling();
          setState({ connected: false, mode: 'disconnected', lastEvent: null });
          return;
        }

        reconnectAttemptsRef.current += 1;

        if (reconnectAttemptsRef.current > maxReconnectAttempts) {
          // 最大再接続回数を超えた場合、ポーリングフォールバック
          console.warn(
            `[EventStream] ${maxReconnectAttempts}回の再接続に失敗。ポーリングに切り替え`
          );
          startPolling();
          return;
        }

        // 指数バックオフ: 1s, 2s, 4s, 8s, 16s (最大30s)
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current - 1),
          30000
        );
        console.log(
          `[EventStream] ${delay}ms後に再接続を試行 (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
        );

        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current?.();
        }, delay);
      };
    } catch (err) {
      // EventSourceの生成自体に失敗した場合（SSE非対応ブラウザなど）
      console.error('[EventStream] SSE接続の初期化に失敗:', err);
      startPolling();
    }
  }, [lang, startPolling, stopPolling]);

  // HIGH #1: connectRef を最新の connect に同期
  connectRef.current = connect;

  // SSE接続のライフサイクル管理
  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled) {
      // 無効化時は全接続をクリーンアップ
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      stopPolling();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setState({ connected: false, mode: 'disconnected', lastEvent: null });
      return;
    }

    // 再接続カウンターをリセット（言語変更時など）
    reconnectAttemptsRef.current = 0;
    pollFailuresRef.current = 0;
    connect();

    // 通信を止める（圏外になった / 画面が見えなくなった）
    const pause = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopPolling();
      setState({ connected: false, mode: 'disconnected', lastEvent: null });
    };

    // 通信を再開する（復帰したので、失敗回数は捨てて即座に取りに行く）
    const resume = () => {
      if (!isMountedRef.current || !canReachNetwork()) return;
      reconnectAttemptsRef.current = 0;
      pollFailuresRef.current = 0;
      connectRef.current?.();
    };

    const handleVisibility = () => {
      if (document.hidden) pause();
      else resume();
    };

    window.addEventListener('online', resume);
    window.addEventListener('offline', pause);
    document.addEventListener('visibilitychange', handleVisibility);

    // クリーンアップ: アンマウント時またはlang/enabled変更時
    return () => {
      isMountedRef.current = false;
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', pause);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopPolling();
    };
  }, [lang, enabled, connect, stopPolling]);

  return state;
}
