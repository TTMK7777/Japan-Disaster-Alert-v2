import { getLocale } from '@/i18n/translations';

/**
 * 取得の失敗を「0 件」と区別するための小道具（B4a）。
 *
 * - `failed`: HTTP エラー・通信エラー・壊れた本文
 * - `timeout`: 期限超過。**画面切替・後続取得による中断（無表示）とは別に扱う**。
 *   以前は期限超過も AbortError として黙って捨てており、初回なら空配列のまま
 *   緑の「警報なし」や空の一覧が出ていた
 */
export type FailureReason = 'failed' | 'timeout';

export interface TimedAbort {
  signal: AbortSignal;
  /** 置換・アンマウントによる中断（期限超過ではない） */
  abort: () => void;
  /** 期限超過で中断されたか */
  timedOut: () => boolean;
  /** 期限タイマーを止める（成功・失敗のどちらでも finally で呼ぶ） */
  clear: () => void;
}

/** 期限つきの AbortController。期限で中断したのか、呼び出し側が中断したのかを区別できる */
export function createTimedAbort(timeoutMs: number): TimedAbort {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    timedOut: () => expired,
    clear: () => clearTimeout(timer),
  };
}

/**
 * catch した例外を分類する。null は「呼び出し側が自分で中断した（表示しない）」。
 * 期限超過は中断でも `timeout` を返す。
 */
export function classifyFetchError(request: TimedAbort, err: unknown): FailureReason | null {
  if (request.timedOut()) return 'timeout';
  if (request.signal.aborted && (err as Error)?.name === 'AbortError') return null;
  return 'failed';
}

/**
 * 「最後に取得できた時刻」の表示。日付と時刻とタイムゾーンを入れる
 * （訪日客の端末は日本時間とは限らず、時刻だけでは何日のことか分からない）
 */
export function formatLastSuccess(at: number, language: string): string {
  return new Date(at).toLocaleString(getLocale(language), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** /api/v1/alerts が一部の予報区を取れなかったときに付けるヘッダ（backend/app/main.py） */
export const FAILED_AREAS_HEADER = 'X-Failed-Areas';
export const FAILED_AREA_NAMES_HEADER = 'X-Failed-Area-Names';

interface HeaderSource {
  headers?: { get(name: string): string | null } | null;
}

/** 取れなかった予報区の地名（表示言語）。欠けが無ければ空。名前が無ければコードで代用する */
export function parseFailedAreas(response: HeaderSource): string[] {
  const headers = response.headers;
  if (!headers || typeof headers.get !== 'function') return [];
  const names = headers.get(FAILED_AREA_NAMES_HEADER);
  const source = names || headers.get(FAILED_AREAS_HEADER);
  if (!source) return [];
  return source
    .split(',')
    .map((part) => {
      try {
        return decodeURIComponent(part).trim();
      } catch {
        return part.trim();
      }
    })
    .filter(Boolean);
}

/**
 * Service Worker が通信失敗時にキャッシュから返した応答に付ける印（public/sw.js と同じ名前）。
 * この応答は「今取れた」ものではない。`X-SW-Cached-At` はキャッシュに保存した時刻（ISO 8601）
 */
export const SW_CACHE_HEADER = 'X-SW-Cache';
export const SW_CACHED_AT_HEADER = 'X-SW-Cached-At';

export interface SwCacheInfo {
  /** SW がキャッシュから返した応答か */
  fromCache: boolean;
  /** 保存した時刻（ms）。旧キャッシュは HTTP Date による取得時刻の推定値。不明なら null */
  cachedAt: number | null;
}

/** 応答が SW のキャッシュ由来かを読む。ヘッダが読めない応答（テストの簡易モック等）は通常の応答とみなす */
export function readSwCache(response: HeaderSource): SwCacheInfo {
  const headers = response.headers;
  if (!headers || typeof headers.get !== 'function') return { fromCache: false, cachedAt: null };
  if (headers.get(SW_CACHE_HEADER) !== '1') return { fromCache: false, cachedAt: null };
  const parsed = Date.parse(headers.get(SW_CACHED_AT_HEADER) ?? '');
  if (!Number.isNaN(parsed)) return { fromCache: true, cachedAt: parsed };
  // 保存時刻のない旧キャッシュでは、サーバーが応答を生成した HTTP Date を
  // 取得時刻の推定値として使う。保存時刻とは異なるため、新しい保存時刻より優先しない。
  // 両方不明でも現在時刻には置き換えない（古いデータを今の取得成功に見せない）。
  const responseDate = Date.parse(headers.get('Date') ?? '');
  return { fromCache: true, cachedAt: Number.isNaN(responseDate) ? null : responseDate };
}
