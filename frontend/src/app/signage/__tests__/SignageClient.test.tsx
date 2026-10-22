import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import SignageClient from '../SignageClient';
import { metadata } from '../page';
import { SIGNAGE_TEXT } from '../signageText';
import { MAX_DENSITY, POLL_INTERVAL_MS, ROTATE_INTERVAL_MS, STALE_LIMIT_MS } from '../signageModel';
import { QR_QUIET_ZONE } from '../../poster/QrCodeSvg';
import { decodeQrMatrix } from '../../poster/__tests__/qrDecode';
import { svgToMatrix } from '../../poster/__tests__/qrSvg';
import { dataset, snapshotAt, tsunami, volcano } from './snapshotFixtures';

const T0_ISO = '2026-10-22T05:30:00Z';
const T0 = Date.parse(T0_ISO);

type Body = unknown | Error;
let responses: Body[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

/** 呼ばれるたびに responses の先頭を返す（最後の 1 件は使い回す） */
function queue(...bodies: Body[]) {
  responses = bodies;
}

function setUrl(pathAndQuery: string) {
  window.history.replaceState(null, '', pathAndQuery);
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function mount() {
  const view = render(<SignageClient />);
  await flush();
  return view;
}

const root = () => screen.getByTestId('signage-root');
const bands = () => screen.queryAllByTestId('signage-band');
const allNoneTexts = Object.values(SIGNAGE_TEXT).flatMap((t) => [t.tsunamiNone, t.quakeNone, t.volcanoNone]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  setUrl('/signage');
  responses = [];
  fetchMock = vi.fn(async () => {
    const body = responses.length > 1 ? responses.shift() : responses[0];
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SignageClient: polling', () => {
  it('fetches the static snapshot (not dynamic APIs) and refetches every 60 s', async () => {
    queue(snapshotAt(T0_ISO));
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/snapshot$/);
    // ブラウザに ETag で再検証させる（If-None-Match を自前で付けると CORS のプリフライトになる）
    expect(init).toMatchObject({ cache: 'no-cache' });

    await advance(POLL_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops polling and rotating after unmount', async () => {
    queue(snapshotAt(T0_ISO));
    const view = await mount();
    view.unmount();
    await advance(POLL_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('SignageClient: language rotation', () => {
  it('rotates en → zh → zh-TW → ko → ja every 15 s and wraps', async () => {
    queue(snapshotAt(T0_ISO));
    await mount();
    const seen = [root().getAttribute('lang')];
    for (let i = 0; i < 5; i++) {
      await advance(ROTATE_INTERVAL_MS);
      seen.push(root().getAttribute('lang'));
    }
    expect(seen).toEqual(['en', 'zh', 'zh-TW', 'ko', 'ja', 'en']);
  });

  it('uses ?langs= in the given order', async () => {
    setUrl('/signage?langs=ko,ja');
    queue(snapshotAt(T0_ISO));
    await mount();
    expect(root().getAttribute('lang')).toBe('ko');
    await advance(ROTATE_INTERVAL_MS);
    expect(root().getAttribute('lang')).toBe('ja');
    await advance(ROTATE_INTERVAL_MS);
    expect(root().getAttribute('lang')).toBe('ko');
  });

  it('keeps special warnings and tsunami warnings on top in every language', async () => {
    queue(
      snapshotAt(T0_ISO, {
        tsunami: dataset('ok', T0_ISO, [tsunami('advisory'), tsunami('major_warning'), tsunami('warning')]),
        volcano_warnings: dataset('ok', T0_ISO, [volcano('extreme')]),
      })
    );
    await mount();
    for (let i = 0; i < 5; i++) {
      const order = bands().map((b) => `${b.dataset.tone}:${b.dataset.pinned}`);
      expect(order).toEqual(['special:true', 'special:true', 'warning:true']);
      // 固定の帯で上限が埋まった分の注意報は「ほか N 件」に回る
      expect(screen.getByTestId('signage-more')).toBeInTheDocument();
      await advance(ROTATE_INTERVAL_MS);
    }
  });
});

describe('SignageClient: outages never read as "no warning"', () => {
  it('shows "unavailable" (not "none") for error datasets', async () => {
    queue(
      snapshotAt(T0_ISO, {
        earthquakes: dataset('error', null, null),
        tsunami: dataset('error', null, null),
        volcano_warnings: dataset('error', null, null),
      })
    );
    await mount();
    const text = document.body.textContent ?? '';
    expect(screen.getAllByTestId('signage-unavailable').length).toBeGreaterThanOrEqual(2);
    expect(text).toContain(SIGNAGE_TEXT.en.unavailable);
    for (const none of allNoneTexts) expect(text).not.toContain(none);
    // 包み（generated_at）は届いていても、中身を 1 つも取得できていないので「最終受信」に時刻を出さない
    expect(screen.getByTestId('signage-last-received').textContent).toContain(SIGNAGE_TEXT.en.neverReceived);
  });

  it('shows "unavailable" when the very first fetch fails', async () => {
    queue(new Error('network down'));
    await mount();
    expect(screen.getAllByTestId('signage-unavailable').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('signage-last-received').textContent).toContain(SIGNAGE_TEXT.en.neverReceived);
  });

  it('switches from "none" to "unavailable" once fetches have failed past the 15 min limit', async () => {
    queue(snapshotAt(T0_ISO), new Error('down'));
    await mount();
    expect(document.body.textContent).toContain(SIGNAGE_TEXT.en.tsunamiNone);

    // 1 回失敗した時点で「なし」は引っ込める（前回時点の「なし」は信用しない）
    await advance(POLL_INTERVAL_MS);
    expect(document.body.textContent).not.toContain(SIGNAGE_TEXT.en.tsunamiNone);

    await advance(STALE_LIMIT_MS);
    // 言語が回っているので、どの言語でも「なし」が出ていないこと
    const text = document.body.textContent ?? '';
    for (const none of allNoneTexts) expect(text).not.toContain(none);
    expect(screen.getAllByTestId('signage-unavailable').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps showing an active tsunami warning while stale, with the time it was received', async () => {
    const fetched = new Date(T0 - 5 * 60_000).toISOString();
    queue(snapshotAt(T0_ISO, { tsunami: dataset('stale', fetched, [tsunami('warning')]) }));
    await mount();
    expect(bands()).toHaveLength(1);
    expect(screen.getByTestId('signage-stale-note').textContent).toContain('14:25 JST');
  });

  it('always shows the last received time and the scope notices', async () => {
    queue(snapshotAt(T0_ISO));
    await mount();
    expect(screen.getByTestId('signage-last-received').textContent).toContain('14:30 JST');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Japan Meteorological Agency');
    expect(text).toContain('evacuation orders');
    expect(text).toContain(SIGNAGE_TEXT.en.weatherNotShown);
  });
});

describe('SignageClient: QR and page metadata', () => {
  it('encodes the top page with ?pref= when a valid prefecture is given', async () => {
    setUrl('/signage?pref=130000');
    queue(snapshotAt(T0_ISO));
    await mount();
    const svg = screen.getByTestId('poster-qr') as unknown as SVGSVGElement;
    expect(decodeQrMatrix(svgToMatrix(svg, QR_QUIET_ZONE)).text).toBe(`${window.location.origin}/?pref=130000`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Tokyo');
  });

  it('ignores an invalid ?pref= (QR points at the top page only)', async () => {
    setUrl('/signage?pref=999999');
    queue(snapshotAt(T0_ISO));
    await mount();
    const svg = screen.getByTestId('poster-qr') as unknown as SVGSVGElement;
    expect(decodeQrMatrix(svgToMatrix(svg, QR_QUIET_ZONE)).text).toBe(`${window.location.origin}/`);
  });

  it('is not indexed by search engines', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});

describe('SignageClient: fitting on small screens', () => {
  function fakeOverflow(overflowing: () => boolean) {
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('signage-bands') && overflowing() ? 1000 : 0;
    });
    const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 500);
    return () => {
      sh.mockRestore();
      ch.mockRestore();
    };
  }

  const specialSnapshot = () =>
    snapshotAt(T0_ISO, {
      tsunami: dataset('ok', T0_ISO, [tsunami('advisory'), tsunami('major_warning')]),
    });

  it('keeps everything when it fits', async () => {
    const restore = fakeOverflow(() => false);
    queue(specialSnapshot());
    await mount();
    expect(root().dataset.density).toBe('0');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('signage-quake')).toBeInTheDocument();
    expect(bands()).toHaveLength(2);
    restore();
  });

  it('removes parts step by step while it overflows, but keeps pinned bands and the scope notices', async () => {
    const restore = fakeOverflow(() => true);
    queue(specialSnapshot());
    await mount();
    expect(root().dataset.density).toBe(String(MAX_DENSITY));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByTestId('signage-quake')).toBeNull();
    // 固定の帯（大津波警報）は残り、注意報は「ほか 1 件」に回る
    expect(bands().map((b) => b.dataset.tone)).toEqual(['special']);
    expect(screen.getByTestId('signage-more')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).toContain(SIGNAGE_TEXT.en.weatherNotShown);
    expect(text).toContain('evacuation orders');
    restore();
  });

  it('measures again from the start when the language changes', async () => {
    let overflowing = true;
    const restore = fakeOverflow(() => overflowing);
    queue(specialSnapshot());
    await mount();
    expect(root().dataset.density).toBe(String(MAX_DENSITY));
    overflowing = false;
    await advance(ROTATE_INTERVAL_MS);
    expect(root().getAttribute('lang')).toBe('zh');
    expect(root().dataset.density).toBe('0');
    restore();
  });
});
