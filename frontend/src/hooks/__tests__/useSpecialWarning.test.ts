import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpecialWarning, SPECIAL_WARNING_POLL_MS } from '../useSpecialWarning';

/**
 * 全タブ共通の特別警報の帯のための取得。
 *
 * - 地域が未選択なら取りに行かない
 * - 警報タブを開いている間は止める（WarningBanner が同じ API を 5 分ごとに取り、report で渡す）。
 *   戻ったときは前回の取得から 5 分経つまで取り直さない（同じ API の二重取得を避ける）
 * - **取得に失敗しても前回の判定を消さない**（圏外になった瞬間に帯が消えると、解除と区別できない）
 * - 地域を変えたら前の地域の判定は使わない（別地域の特別警報を今の地域のものとして出さない）
 */

const EXTREME = [{ id: 'a', severity: 'extreme', is_continuing: true }];
const ADVISORY = [{ id: 'b', severity: 'medium', is_continuing: false }];

type Responder = (url: string) => { ok: boolean; body?: unknown } | 'hang';
let respond: Responder;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const r = respond(String(input));
  // 応答しない。中断されたら本物の fetch と同じく AbortError で reject する
  if (r === 'hang')
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  return { ok: r.ok, status: r.ok ? 200 : 503, json: async () => r.body };
});
const alertCalls = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/api/v1/alerts'));

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockClear();
  respond = () => ({ ok: true, body: EXTREME });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useSpecialWarning', () => {
  it('地域が未選択なら取りに行かず、帯は出さない', async () => {
    const { result } = renderHook(() => useSpecialWarning({ prefCode: null, language: 'en', paused: false }));
    await flush();
    expect(alertCalls()).toHaveLength(0);
    expect(result.current.active).toBe(false);
  });

  it('選択中の地域で特別警報（継続中）が出ていれば active、5 分ごとに取り直す', async () => {
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    expect(alertCalls()).toEqual([expect.stringContaining('area_code=130000')]);
    expect(result.current.active).toBe(true);

    respond = () => ({ ok: true, body: ADVISORY }); // 解除されて注意報だけになった
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPECIAL_WARNING_POLL_MS);
    });
    expect(alertCalls()).toHaveLength(2);
    expect(result.current.active).toBe(false);
  });

  it('取得に失敗しても前回の判定（特別警報あり）を消さない', async () => {
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    expect(result.current.active).toBe(true);
    respond = () => ({ ok: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPECIAL_WARNING_POLL_MS);
    });
    expect(alertCalls()).toHaveLength(2);
    expect(result.current.active).toBe(true);
  });

  it('地域を変えたら前の地域の判定を使わない（新しい地域の応答が来るまで出さない）', async () => {
    const { result, rerender } = renderHook((p: { prefCode: string }) =>
      useSpecialWarning({ prefCode: p.prefCode, language: 'en', paused: false }),
      { initialProps: { prefCode: '130000' } }
    );
    await flush();
    expect(result.current.active).toBe(true);
    respond = () => 'hang';
    rerender({ prefCode: '270000' });
    await flush();
    expect(alertCalls().at(-1)).toContain('area_code=270000');
    expect(result.current.active).toBe(false);
  });

  it('止めている間（警報タブ）は取らず、report で渡された結果を使う。戻っても 5 分経つまで取り直さない', async () => {
    const { result, rerender } = renderHook((p: { paused: boolean }) =>
      useSpecialWarning({ prefCode: '130000', language: 'en', paused: p.paused }),
      { initialProps: { paused: true } }
    );
    await flush();
    expect(alertCalls()).toHaveLength(0);
    act(() => result.current.report('130000', EXTREME));
    expect(result.current.active).toBe(true);

    // 別地域の結果は今の地域の判定にしない
    act(() => result.current.report('270000', ADVISORY));
    expect(result.current.active).toBe(false);
    act(() => result.current.report('130000', EXTREME));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    rerender({ paused: false });
    await flush();
    expect(alertCalls()).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPECIAL_WARNING_POLL_MS - 60_000);
    });
    expect(alertCalls()).toHaveLength(1);
  });

  it('言語を変えても取り直さない（判定は言語に依存しない）', async () => {
    const { rerender } = renderHook((p: { language: string }) =>
      useSpecialWarning({ prefCode: '130000', language: p.language, paused: false }),
      { initialProps: { language: 'en' } }
    );
    await flush();
    rerender({ language: 'ko' });
    await flush();
    expect(alertCalls()).toHaveLength(1);
  });
});

describe('useSpecialWarning — 取得失敗・一部欠落を「特別警報なし」に読まない（B4a）', () => {
  function respondWithHeaders(body: unknown, headers: Record<string, string>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: (n: string) => headers[n] ?? null },
        json: async () => body,
      }))
    );
  }

  it('一部の予報区が取れず、取れた分に特別警報が無ければ前回の判定を保つ', async () => {
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '471000', language: 'en', paused: false }));
    await flush();
    expect(result.current.active).toBe(true);
    respondWithHeaders(ADVISORY, { 'X-Failed-Areas': '474000' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPECIAL_WARNING_POLL_MS);
    });
    expect(result.current.active).toBe(true);
  });

  it('一部欠落でも、取れた分に特別警報があれば出す', async () => {
    respondWithHeaders(EXTREME, { 'X-Failed-Areas': '474000' });
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '471000', language: 'en', paused: false }));
    await flush();
    expect(result.current.active).toBe(true);
  });

  it('report の partial も同じ扱い（警報タブから渡される結果）', async () => {
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '471000', language: 'en', paused: true }));
    act(() => result.current.report('471000', EXTREME));
    act(() => result.current.report('471000', ADVISORY, { partial: true }));
    expect(result.current.active).toBe(true);
    act(() => result.current.report('471000', ADVISORY));
    expect(result.current.active).toBe(false);
  });

  it('期限超過でも前回の判定を保つ', async () => {
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    respond = () => 'hang';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPECIAL_WARNING_POLL_MS + 10_000);
    });
    expect(result.current.active).toBe(true);
  });
});

describe('useSpecialWarning — 判定がまだ無い地域の取得失敗は「未確認」（Codex P1）', () => {
  // 以前は result が null のまま active=false になり、初回・地域変更直後に取れなかった利用者ほど
  // 「確認できていない」ことさえ分からなかった（#106 / #107 の Codex 指摘）
  const CACHED = { 'X-SW-Cache': '1', 'X-SW-Cached-At': '2026-10-21T00:00:00.000Z' };
  function respondWith(body: unknown, headers: Record<string, string>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: (n: string) => headers[n] ?? null },
        json: async () => body,
      }))
    );
  }

  it('初回の取得が失敗したら unconfirmed（active ではない）', async () => {
    respond = () => ({ ok: false });
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    expect(result.current.active).toBe(false);
    expect(result.current.unconfirmed).toBe(true);
  });

  it('初回の期限超過も unconfirmed', async () => {
    respond = () => 'hang';
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    expect(result.current.unconfirmed).toBe(false); // 応答待ちの間は出さない（ちらつかせない）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.unconfirmed).toBe(true);
  });

  it('初回が SW のキャッシュ応答なら unconfirmed', async () => {
    respondWith(ADVISORY, CACHED);
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    expect(result.current.unconfirmed).toBe(true);
  });

  it('初回が一部欠落で、取れた分に特別警報が無ければ unconfirmed', async () => {
    respondWith(ADVISORY, { 'X-Failed-Areas': '474000' });
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '471000', language: 'en', paused: false }));
    await flush();
    expect(result.current.active).toBe(false);
    expect(result.current.unconfirmed).toBe(true);
  });

  it('report の一部欠落（警報タブから）でも、判定が無ければ unconfirmed', () => {
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '471000', language: 'en', paused: true }));
    act(() => result.current.report('471000', ADVISORY, { partial: true }));
    expect(result.current.unconfirmed).toBe(true);
    act(() => result.current.report('471000', ADVISORY));
    expect(result.current.unconfirmed).toBe(false);
  });

  it('次の取得が成功したら解除する（なし → 帯なし、あり → 特別警報の帯）', async () => {
    respond = () => ({ ok: false });
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    expect(result.current.unconfirmed).toBe(true);
    respond = () => ({ ok: true, body: ADVISORY });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPECIAL_WARNING_POLL_MS);
    });
    expect(result.current.unconfirmed).toBe(false);
    expect(result.current.active).toBe(false);
    respond = () => ({ ok: true, body: EXTREME });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPECIAL_WARNING_POLL_MS);
    });
    expect(result.current.active).toBe(true);
  });

  it('判定がある地域の失敗は従来どおり前回の判定を保ち、unconfirmed にしない', async () => {
    respond = () => ({ ok: true, body: ADVISORY });
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    respond = () => ({ ok: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPECIAL_WARNING_POLL_MS);
    });
    expect(result.current.unconfirmed).toBe(false);
    expect(result.current.active).toBe(false);
  });

  it('地域を変えた直後の失敗は新しい地域で unconfirmed、前の地域の未確認は持ち越さない', async () => {
    respond = () => ({ ok: false });
    const { result, rerender } = renderHook((p: { prefCode: string }) =>
      useSpecialWarning({ prefCode: p.prefCode, language: 'en', paused: false }),
      { initialProps: { prefCode: '130000' } }
    );
    await flush();
    expect(result.current.unconfirmed).toBe(true);
    respond = () => 'hang';
    rerender({ prefCode: '270000' });
    expect(result.current.unconfirmed).toBe(false); // 270000 はまだ応答待ち
    respond = () => ({ ok: false });
    rerender({ prefCode: '400000' });
    await flush();
    expect(result.current.unconfirmed).toBe(true);
  });

  it('200 でも配列でない本文は「なし」にせず unconfirmed（形の異常は失敗）', async () => {
    respond = () => ({ ok: true, body: { detail: 'upstream error' } });
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    expect(result.current.active).toBe(false);
    expect(result.current.unconfirmed).toBe(true);
  });

  it('別の地域の結果（report）で今の地域の未確認を消さない', async () => {
    respond = () => ({ ok: false });
    const { result } = renderHook(() => useSpecialWarning({ prefCode: '130000', language: 'en', paused: false }));
    await flush();
    expect(result.current.unconfirmed).toBe(true);
    act(() => result.current.report('270000', ADVISORY));
    expect(result.current.unconfirmed).toBe(true);
  });

  it('地域を切り替えて中断した取得は失敗として数えない', async () => {
    respond = () => 'hang';
    const { result, rerender } = renderHook((p: { prefCode: string }) =>
      useSpecialWarning({ prefCode: p.prefCode, language: 'en', paused: false }),
      { initialProps: { prefCode: '130000' } }
    );
    await flush();
    respond = () => ({ ok: true, body: ADVISORY });
    rerender({ prefCode: '270000' });
    await flush();
    rerender({ prefCode: '130000' });
    await flush();
    expect(result.current.unconfirmed).toBe(false);
  });
});
