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
  /**
   * 低電力・低回線モード。SSE の常時接続をやめ、`lowPowerInterval` ごとのポーリングにする。
   * 1 回の取得で地震と津波の両方を取る（津波を取りこぼさない）
   */
  lowPower?: boolean;
  /** 低電力モードのポーリング間隔（ミリ秒、デフォルト: LOW_POWER_POLL_INTERVAL_MS） */
  lowPowerInterval?: number;
}

interface EventStreamState {
  connected: boolean;
  mode: 'sse' | 'polling' | 'disconnected';
  lastEvent: string | null;
}

interface Freshness {
  /** 最後に取得できた時刻（epoch ms）。一度も取れていなければ null */
  lastSuccessAt: number | null;
  /** 直近の取得が失敗したか（成功時刻は書き換えない） */
  lastFailed: boolean;
}

export interface EventStreamResult extends EventStreamState, Freshness {
  /** 取得中か（「今すぐ更新」を押せない状態） */
  refreshing: boolean;
  /** 次の自動取得の予定時刻（epoch ms）。ポーリングしていなければ null */
  nextPollAt: number | null;
  /** 今すぐ取りに行く。取得中・圏外では新しいリクエストを出さない */
  refresh: () => void;
  /**
   * 呼び出し側が自前で行った取得の**失敗だけ**を表示に反映する（成功時刻は書き換えない）。
   * 成功は報告させない: page の地震だけの取得が成功しても、津波が取れていなければ
   * 「最新・失敗なし」にしてはいけないため（PR#97 レビュー must-fix 2）
   */
  reportFailure: () => void;
}

/** ポーリング間隔の上限。連続失敗のたびに倍にして、ここで頭打ちにする */
const MAX_POLL_INTERVAL_MS = 300000; // 5分

/** 低電力モードの自動取得の間隔 */
export const LOW_POWER_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** 1 回の取得のタイムアウト */
const FETCH_TIMEOUT_MS = 10000;

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

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * SSEによるリアルタイムイベントストリーム接続フック
 *
 * SSE接続に失敗した場合、自動的にポーリングフォールバックに切り替える。
 * 指数バックオフ付きの自動再接続を行い、最大5回再試行後にポーリングへ移行する。
 *
 * `lowPower` のときは SSE を開かず、最初からポーリングする（間隔は 5 分固定）。
 */
export function useEventStream(options: EventStreamOptions): EventStreamResult {
  const {
    lang,
    onEarthquake,
    onTsunami,
    onHeartbeat,
    fallbackInterval = 30000,
    enabled = true,
    lowPower = false,
    lowPowerInterval = LOW_POWER_POLL_INTERVAL_MS,
  } = options;

  const [state, setState] = useState<EventStreamState>({
    connected: false,
    mode: 'disconnected',
    lastEvent: null,
  });
  const [freshness, setFreshness] = useState<Freshness>({ lastSuccessAt: null, lastFailed: false });
  const [refreshing, setRefreshing] = useState(false);
  const [nextPollAt, setNextPollAt] = useState<number | null>(null);

  // コールバックの最新値を保持するref
  const callbacksRef = useRef({ onEarthquake, onTsunami, onHeartbeat });
  callbacksRef.current = { onEarthquake, onTsunami, onHeartbeat };

  // 取得 URL の言語。取得関数を言語ごとに作り直さないため ref で持つ
  // （言語が変わったときの再接続は下の effect の依存 lang が担う）
  const langRef = useRef(lang);
  langRef.current = lang;

  // HIGH #1: connect関数の最新版を保持するref（stale closure回避）
  const connectRef = useRef<(() => void) | null>(null);

  // HIGH #2: アンマウント後のsetState防止
  const isMountedRef = useRef(true);

  // 接続の世代。effect の掛け直し（言語・モード切替・アンマウント）で進め、
  // 前の世代の取得結果が後から返ってきても反映しない
  const generationRef = useRef(0);

  // 再接続試行回数
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // タイマー・EventSourceの参照
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ポーリング中なら「今すぐ取る」入口。SSE 中・停止中は null
  const pollNowRef = useRef<(() => void) | null>(null);

  // ポーリングの連続失敗回数（間隔を伸ばすために使う）
  const pollFailuresRef = useRef(0);

  // 進行中の取得（同時に 1 本だけにする）
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const inFlightAbortRef = useRef<AbortController | null>(null);

  // 低電力ポーリングの予定を決めるための「最後に最新だと確認できた時刻」。
  // 地震と津波の両方が取れた取得と、SSE の受信だけで進める
  const lastFreshAtRef = useRef<number | null>(null);
  const lastAttemptFailedRef = useRef(false);

  // いまの SSE 接続で、地震と津波の取り直しが一度でも成功したか。
  // **SSE は接続時に現在の状態を送らず、津波は ID 集合が変わったときだけ配信される**
  // （backend/app/services/event_manager.py）。接続し直した直後の heartbeat で「最新」と
  // 表示すると、切れていた間（低電力中・圏外・バックグラウンド）に出た津波警報が
  // 届かないまま「最新・津波なし」に見える。取り直しが成功するまでは heartbeat を数えない
  const connectionVerifiedRef = useRef(false);

  // 表示状態（mode）の最新値。refresh から参照する（依存に state を入れないため）
  const modeRef = useRef<EventStreamState['mode']>('disconnected');

  const recordSuccess = useCallback(() => {
    const now = Date.now();
    lastFreshAtRef.current = now;
    lastAttemptFailedRef.current = false;
    setFreshness({ lastSuccessAt: now, lastFailed: false });
  }, []);

  const recordFailure = useCallback(() => {
    lastAttemptFailedRef.current = true;
    // 成功時刻は書き換えない
    setFreshness((prev) => (prev.lastFailed ? prev : { ...prev, lastFailed: true }));
  }, []);

  const reportFailure = useCallback(() => {
    setFreshness((prev) => (prev.lastFailed ? prev : { ...prev, lastFailed: true }));
  }, []);

  // ポーリング停止
  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setNextPollAt(null);
  }, []);

  /**
   * 地震と津波を 1 回取る。同時に 1 本だけ（進行中なら同じ Promise を返す）。
   * 戻り値は「両方とも取れたか」。
   *
   * **津波だけ失敗したら成功扱いにしない。** 地震が取れたからといって
   * 「最後に取得できた時刻」を進めると、津波の情報が古いのに新しく見える。
   * 取れた地震は画面に出すが、津波は呼び出し側へ渡さない（空で「津波なし」と断定しない）。
   */
  const runSnapshot = useCallback((): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;

    const generation = generationRef.current;
    const controller = new AbortController();
    inFlightAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const l = sanitizeLang(langRef.current);
    setRefreshing(true);

    const promise: Promise<boolean> = (async () => {
      const [earthquakes, tsunamis] = await Promise.allSettled([
        fetchJson(`${API_BASE_URL}/api/v1/earthquakes?lang=${l}&limit=20`, controller.signal),
        fetchJson(`${API_BASE_URL}/api/v1/tsunami/active?lang=${l}`, controller.signal),
      ]);
      clearTimeout(timeoutId);
      if (generation !== generationRef.current) return false;

      const updatedAt = new Date().toISOString();
      if (earthquakes.status === 'fulfilled') {
        callbacksRef.current.onEarthquake?.({
          earthquakes: earthquakes.value as any[],
          updated_at: updatedAt,
        });
      } else {
        console.error('[EventStream] 地震の取得エラー:', earthquakes.reason);
      }

      const tsunamiOk = tsunamis.status === 'fulfilled' && Array.isArray(tsunamis.value);
      if (tsunamiOk) {
        callbacksRef.current.onTsunami?.({
          tsunamis: tsunamis.value as any[],
          updated_at: updatedAt,
        });
      } else {
        console.error(
          '[EventStream] 津波の取得エラー:',
          tsunamis.status === 'rejected' ? tsunamis.reason : 'not an array'
        );
      }

      const ok = earthquakes.status === 'fulfilled' && tsunamiOk;
      if (ok) {
        connectionVerifiedRef.current = true;
        recordSuccess();
        setState((prev) => ({ ...prev, lastEvent: updatedAt }));
      } else {
        recordFailure();
      }
      return ok;
    })().finally(() => {
      clearTimeout(timeoutId);
      if (inFlightRef.current === promise) {
        inFlightRef.current = null;
        inFlightAbortRef.current = null;
      }
      if (inFlightRef.current === null) setRefreshing(false);
    });

    inFlightRef.current = promise;
    return promise;
  }, [recordSuccess, recordFailure]);

  // ポーリング: 地震と津波を取得する
  //
  // 一定間隔の setInterval ではなく、1回ごとに次を予約する形にしてある。
  // 通常モード（SSE が使えないときのフォールバック）では失敗が続くほど間隔を伸ばし
  // （30s → 60s → … 最大5分）、低電力モードでは 5 分固定。
  // 圏外・バックグラウンドでは**次を予約せずに止まる**。再開は online / visibilitychange のリスナが行う。
  //
  // initialDelay: 最初の取得までの待ち時間。低電力モードで、直前に最新を確認できているなら
  // すぐには取らずに残り時間だけ待つ（切替やバックグラウンド復帰のたびに取りに行かない）
  const startPolling = useCallback((initialDelay = 0) => {
    stopPolling();
    const generation = generationRef.current;

    setState((prev) => ({ ...prev, mode: 'polling', connected: false }));

    const scheduleIn = (delay: number) => {
      if (!isMountedRef.current || generation !== generationRef.current) return;
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = setTimeout(poll, delay);
      setNextPollAt(Date.now() + delay);
    };

    const scheduleNext = () => {
      if (lowPower) {
        scheduleIn(lowPowerInterval);
        return;
      }
      // 2^4 で頭打ち。上限は MAX_POLL_INTERVAL_MS
      const backoff = Math.pow(2, Math.min(pollFailuresRef.current, 4));
      scheduleIn(Math.min(fallbackInterval * backoff, MAX_POLL_INTERVAL_MS));
    };

    const poll = async () => {
      pollingTimerRef.current = null;
      if (!isMountedRef.current || generation !== generationRef.current) return;

      if (!canReachNetwork()) {
        // 次を予約しない＝ここで止まる。復帰時にリスナが呼び直す
        setNextPollAt(null);
        setState((prev) => ({ ...prev, mode: 'disconnected', connected: false }));
        return;
      }

      const ok = await runSnapshot();
      if (!isMountedRef.current || generation !== generationRef.current) return;
      // 待っている間に止められた（圏外・バックグラウンド・SSE への切替）なら、
      // 次の予約も表示状態の上書きもしない
      if (pollNowRef.current !== pollNow) return;
      if (ok) {
        pollFailuresRef.current = 0;
        setState((prev) => ({ ...prev, mode: 'polling' }));
      } else {
        pollFailuresRef.current += 1;
      }
      scheduleNext();
    };

    const pollNow = () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      void poll();
    };
    pollNowRef.current = pollNow;

    if (initialDelay > 0) {
      scheduleIn(initialDelay);
    } else {
      void poll();
    }
  }, [lowPower, lowPowerInterval, fallbackInterval, stopPolling, runSnapshot]);

  // SSE接続を確立
  const connect = useCallback(() => {
    // 新しい接続（またはポーリング）では、取り直しが成功するまで「最新」と扱わない
    connectionVerifiedRef.current = false;

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
      pollNowRef.current = null;
      setState({ connected: false, mode: 'disconnected', lastEvent: null });
      return;
    }

    // 低電力モード: SSE の常時接続を張らず、ポーリングだけで回す。
    // 直前に最新を確認できていれば、残り時間だけ待ってから取る
    if (lowPower) {
      const last = lastFreshAtRef.current;
      const delay =
        last === null || lastAttemptFailedRef.current
          ? 0
          : Math.max(0, lowPowerInterval - (Date.now() - last));
      startPolling(delay);
      return;
    }

    try {
      const url = `${API_BASE_URL}/api/v1/events/stream?lang=${sanitizeLang(lang)}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      pollNowRef.current = null;

      // 接続成功
      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;
        stopPolling();
        pollNowRef.current = null;
        setState({
          connected: true,
          mode: 'sse',
          lastEvent: null,
        });
        // 接続のたびに地震と津波を取り直す（接続時に現在の状態は届かないため）
        void runSnapshot();
      };

      // 地震イベント
      eventSource.addEventListener('earthquake', (event: MessageEvent) => {
        try {
          const data: EarthquakeEventData = JSON.parse(event.data);
          callbacksRef.current.onEarthquake?.(data);
          if (connectionVerifiedRef.current) recordSuccess();
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
          if (connectionVerifiedRef.current) recordSuccess();
          setState((prev) => ({
            ...prev,
            lastEvent: new Date().toISOString(),
          }));
        } catch (err) {
          console.error('[EventStream] 津波イベントのパースエラー:', err);
        }
      });

      // ハートビートイベント。接続が生きていて、変化があれば届いている＝
      // 表示中の情報は今の時点で最新、とみなす
      eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
        try {
          const data: HeartbeatEventData = JSON.parse(event.data);
          callbacksRef.current.onHeartbeat?.(data);
          if (connectionVerifiedRef.current) recordSuccess();
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
  }, [lang, lowPower, lowPowerInterval, startPolling, stopPolling, recordSuccess, runSnapshot]);

  // HIGH #1: connectRef を最新の connect に同期
  connectRef.current = connect;
  modeRef.current = state.mode;

  /** 「今すぐ更新」。取得中は何もしない（連打で多重リクエストしない） */
  const refresh = useCallback(() => {
    if (!isMountedRef.current || inFlightRef.current) return;
    if (!canReachNetwork()) {
      // 押したのに取れなかったことは伝える（成功時刻はそのまま）
      recordFailure();
      return;
    }
    if (!pollNowRef.current && (lowPower || modeRef.current === 'disconnected')) {
      // 止まっている（online / visibilitychange を取りこぼした等）。
      // 接続し直して自動更新も再開する。低電力ならこのあと今すぐ取る
      connectRef.current?.();
      if (!lowPower) return; // SSE は onopen で取り直す
    }
    if (pollNowRef.current) {
      // ポーリング中なら今取り、次の自動取得はそこから数え直す
      if (!inFlightRef.current) pollNowRef.current();
    } else {
      void runSnapshot();
    }
  }, [lowPower, recordFailure, runSnapshot]);

  // SSE接続のライフサイクル管理
  useEffect(() => {
    isMountedRef.current = true;
    generationRef.current += 1;
    if (!enabled) {
      // 無効化時は全接続をクリーンアップ
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      stopPolling();
      pollNowRef.current = null;
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
      pollNowRef.current = null;
      setState({ connected: false, mode: 'disconnected', lastEvent: null });
    };

    // 通信を再開する（復帰したので、失敗回数は捨てて取りに行く。
    // 低電力モードでは直前に取れていれば残り時間だけ待つ — connect が判断する）
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

    // クリーンアップ: アンマウント時または lang/enabled/lowPower 変更時
    return () => {
      isMountedRef.current = false;
      // 前の世代の取得結果は反映しない。進行中の取得は中断する
      generationRef.current += 1;
      inFlightAbortRef.current?.abort();
      inFlightRef.current = null;
      inFlightAbortRef.current = null;
      pollNowRef.current = null;
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

  return {
    ...state,
    ...freshness,
    refreshing,
    nextPollAt,
    refresh,
    reportFailure,
  };
}
