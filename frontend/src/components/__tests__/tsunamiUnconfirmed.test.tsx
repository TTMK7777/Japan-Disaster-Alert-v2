import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import EmergencyAlert, { TSUNAMI_FETCH_TIMEOUT_MS, jmaTsunamiUrl } from '../EmergencyAlert';
import { getTranslation } from '@/i18n/translations';
import { SW_CACHE_HEADER, SW_CACHED_AT_HEADER } from '@/lib/fetchFailure';

/**
 * 津波の初回取得（/api/v1/tsunami/active）が取れないとき（B4b）。
 *
 * 以前は非 200・例外を黙って捨て、期限も無かったため、取れないあいだは
 * 「津波警報なし」と同じ無表示だった。取れなかったら常設の小さな帯で
 * 「確認できない・海の近くで強い揺れなら高い所へ」と公式（気象庁）への導線を出す。
 *
 * タイマー（期限）があるので fake timers で回す。
 */

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;

/** 期限で中断されたら AbortError で落ちる、返ってこない fetch（実ブラウザの fetch と同じ振る舞い） */
const hangingFetch: FetchImpl = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('Aborted', 'AbortError'))
    );
  });

function stubFetch(impl: FetchImpl) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

const band = () => screen.queryByTestId('tsunami-unconfirmed');

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('津波の初回取得が失敗したら「津波なし」と同じ無表示にしない', () => {
  it('503 なら帯を出し、行動の指示と気象庁への導線を並べる', async () => {
    stubFetch(async () => jsonResponse({}, { status: 503 }));
    render(<EmergencyAlert language="ja" />);
    await flush();
    const el = band();
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('data-reason', 'failed');
    expect(el).toHaveTextContent(getTranslation('ja', 'tsunami.unconfirmed'));
    const link = screen.getByRole('link', { name: new RegExp(getTranslation('ja', 'tsunami.officialLink')) });
    expect(link).toHaveAttribute('href', jmaTsunamiUrl('ja'));
    expect(link.getAttribute('href')).toContain('jma.go.jp/bosai/map.html#contents=tsunami');
    // 全画面の警報（alertdialog）は出さない（警報があると断定もしない）
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('通信エラー（TypeError）でも帯を出す', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(<EmergencyAlert language="en" />);
    await flush();
    expect(band()).toHaveTextContent(getTranslation('en', 'tsunami.unconfirmed'));
  });

  it('200 でも配列でなければ帯を出す', async () => {
    stubFetch(async () => jsonResponse({ detail: 'x' }));
    render(<EmergencyAlert language="en" />);
    await flush();
    expect(band()).not.toBeNull();
  });

  it('返ってこなければ期限（10 秒）で打ち切って帯を出す。期限前は出さない', async () => {
    const mock = stubFetch(hangingFetch);
    render(<EmergencyAlert language="ja" />);
    await flush();
    expect(mock).toHaveBeenCalledTimes(1);
    expect((mock.mock.calls[0][1] as RequestInit | undefined)?.signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TSUNAMI_FETCH_TIMEOUT_MS - 1);
    });
    expect(band()).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(band()).toHaveAttribute('data-reason', 'timeout');
    expect(band()).toHaveTextContent(getTranslation('ja', 'status.timedOut'));
  });

  it('期限前にアンマウントしたら中断するだけで何も出さない（置換・画面遷移は失敗ではない）', async () => {
    const mock = stubFetch(hangingFetch);
    const { unmount } = render(<EmergencyAlert language="ja" />);
    await flush();
    const signal = (mock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TSUNAMI_FETCH_TIMEOUT_MS * 2);
    });
    expect(band()).toBeNull();
  });

  it('SW がキャッシュから返した応答は「今の確認」ではないので帯を出す', async () => {
    stubFetch(async () =>
      jsonResponse([], {
        headers: { [SW_CACHE_HEADER]: '1', [SW_CACHED_AT_HEADER]: '2026-10-21T00:00:00.000Z' },
      })
    );
    render(<EmergencyAlert language="ja" />);
    await flush();
    expect(band()).not.toBeNull();
  });
});

describe('取れたときは帯を出さない', () => {
  it('200 の空配列（確認できた津波なし）は無表示', async () => {
    stubFetch(async () => jsonResponse([]));
    render(<EmergencyAlert language="ja" />);
    await flush();
    expect(band()).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('初回取得が失敗しても、SSE・ポーリングで津波の状態が届いたら帯を消す', async () => {
    stubFetch(async () => jsonResponse({}, { status: 503 }));
    const { rerender } = render(<EmergencyAlert language="ja" />);
    await flush();
    expect(band()).not.toBeNull();
    rerender(<EmergencyAlert language="ja" tsunamis={[]} />);
    expect(band()).toBeNull();
  });

  it('初回取得で出した津波警報は、その後の帯の有無にかかわらず表示する', async () => {
    stubFetch(async () => jsonResponse([{ id: 't1', warning_level: 'warning' }]));
    render(<EmergencyAlert language="en" />);
    await flush();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(band()).toBeNull();
  });
});
