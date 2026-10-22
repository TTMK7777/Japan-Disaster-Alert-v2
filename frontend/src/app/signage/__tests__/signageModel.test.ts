import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIGNAGE_LANGS,
  INITIAL_MEMORY,
  MAX_DENSITY,
  STALE_LIMIT_MS,
  applyFetchResult,
  buildAlertBands,
  datasetView,
  densityFlags,
  formatIntensity,
  formatJst,
  limitBands,
  otherVolcanoes,
  parseLangsParam,
  parseSnapshot,
  regionName,
  resolveSignageOrigin,
  type SnapshotMemory,
} from '../signageModel';
import { dataset, quake, snapshotAt, tsunami, volcano } from './snapshotFixtures';

const T0_ISO = '2026-10-22T05:30:00Z';
const T0 = Date.parse(T0_ISO);
const MIN = 60_000;

function received(raw: unknown, at: number, memory: SnapshotMemory = INITIAL_MEMORY): SnapshotMemory {
  const snapshot = parseSnapshot(raw);
  if (!snapshot) throw new Error('fixture did not parse');
  return applyFetchResult(memory, { ok: true, snapshot }, at);
}

describe('parseSnapshot', () => {
  it('reads a valid snapshot', () => {
    const parsed = parseSnapshot(snapshotAt(T0_ISO));
    expect(parsed).not.toBeNull();
    expect(parsed!.generatedAt).toBe(T0);
    expect(parsed!.datasets.earthquakes.status).toBe('ok');
    expect(parsed!.datasets.earthquakes.items).toHaveLength(1);
  });

  it.each([
    ['null', null],
    ['not an object', 'oops'],
    ['missing datasets', { schema_version: '1.0', generated_at: T0_ISO }],
    ['unknown major version', { ...snapshotAt(T0_ISO), schema_version: '2.0' }],
    ['bad generated_at', { ...snapshotAt(T0_ISO), generated_at: 'yesterday' }],
    ['unknown status', snapshotAt(T0_ISO, { tsunami: dataset('fine' as never, T0_ISO, []) })],
    ['ok without items', snapshotAt(T0_ISO, { tsunami: dataset('ok', T0_ISO, null) })],
    ['ok without fetched_at', snapshotAt(T0_ISO, { tsunami: dataset('ok', null, []) })],
  ])('rejects %s', (_label, raw) => {
    expect(parseSnapshot(raw)).toBeNull();
  });

  it('accepts a newer minor version (key additions are compatible)', () => {
    expect(parseSnapshot({ ...snapshotAt(T0_ISO), schema_version: '1.3' })).not.toBeNull();
  });

  it('keeps an error dataset as error (items null, not an empty list)', () => {
    const parsed = parseSnapshot(snapshotAt(T0_ISO, { tsunami: dataset('error', null, null) }));
    expect(parsed!.datasets.tsunami.status).toBe('error');
    expect(parsed!.datasets.tsunami.items).toBeNull();
  });

  it('treats an unrecognised tsunami level as unknown (shown, not dropped)', () => {
    const parsed = parseSnapshot(snapshotAt(T0_ISO, { tsunami: dataset('ok', T0_ISO, [tsunami('mystery')]) }));
    expect(parsed!.datasets.tsunami.items![0].level).toBe('unknown');
  });
});

describe('datasetView: never reports "none" when the data is not trustworthy', () => {
  it('is loading before the first attempt', () => {
    expect(datasetView(INITIAL_MEMORY, 'tsunami', T0).kind).toBe('loading');
  });

  it('is unavailable when the first attempt failed', () => {
    const memory = applyFetchResult(INITIAL_MEMORY, { ok: false }, T0);
    expect(datasetView(memory, 'tsunami', T0)).toEqual({ kind: 'unavailable', lastFetchedAt: null });
  });

  it('is ok with a confirmed empty list', () => {
    const memory = received(snapshotAt(T0_ISO), T0);
    expect(datasetView(memory, 'tsunami', T0 + MIN)).toEqual({ kind: 'ok', items: [], fetchedAt: T0 });
  });

  it('is unavailable for status error, and remembers the last fetched time from earlier snapshots', () => {
    let memory = received(snapshotAt(T0_ISO), T0);
    const later = new Date(T0 + 2 * MIN).toISOString();
    memory = received(snapshotAt(later, { tsunami: dataset('error', null, null) }), T0 + 2 * MIN, memory);
    expect(datasetView(memory, 'tsunami', T0 + 2 * MIN)).toEqual({ kind: 'unavailable', lastFetchedAt: T0 });
  });

  it('stale with an empty list is unavailable (an old "none" is not shown)', () => {
    const fetched = new Date(T0 - 5 * MIN).toISOString();
    const memory = received(snapshotAt(T0_ISO, { tsunami: dataset('stale', fetched, []) }), T0);
    expect(datasetView(memory, 'tsunami', T0)).toEqual({ kind: 'unavailable', lastFetchedAt: T0 - 5 * MIN });
  });

  it('stale with items keeps showing them (hiding an active warning is worse)', () => {
    const fetched = new Date(T0 - 5 * MIN).toISOString();
    const memory = received(snapshotAt(T0_ISO, { tsunami: dataset('stale', fetched, [tsunami('warning')]) }), T0);
    const view = datasetView(memory, 'tsunami', T0);
    expect(view.kind).toBe('stale');
  });

  it('turns ok into stale when the latest client fetch failed', () => {
    let memory = received(snapshotAt(T0_ISO, { tsunami: dataset('ok', T0_ISO, [tsunami('advisory')]) }), T0);
    memory = applyFetchResult(memory, { ok: false }, T0 + MIN);
    expect(datasetView(memory, 'tsunami', T0 + MIN).kind).toBe('stale');
  });

  it('becomes unavailable once the data is older than the stale limit (15 min), even with items', () => {
    let memory = received(snapshotAt(T0_ISO, { tsunami: dataset('ok', T0_ISO, [tsunami('advisory')]) }), T0);
    memory = applyFetchResult(memory, { ok: false }, T0 + MIN);
    expect(datasetView(memory, 'tsunami', T0 + STALE_LIMIT_MS).kind).toBe('stale');
    expect(datasetView(memory, 'tsunami', T0 + STALE_LIMIT_MS + 1)).toEqual({
      kind: 'unavailable',
      lastFetchedAt: T0,
    });
  });

  it('a TV clock running behind does not keep old data alive (server-relative age)', () => {
    // サーバー時刻で 14 分前に取得した値。テレビの時計が 1 時間遅れていても、受信から 2 分で上限を超える
    const fetched = new Date(T0 - 14 * MIN).toISOString();
    const tvClock = T0 - 60 * MIN;
    const memory = received(snapshotAt(T0_ISO, { tsunami: dataset('stale', fetched, [tsunami('advisory')]) }), tvClock);
    expect(datasetView(memory, 'tsunami', tvClock).kind).toBe('stale');
    expect(datasetView(memory, 'tsunami', tvClock + 2 * MIN).kind).toBe('unavailable');
  });

  it('an old cached snapshot (e.g. from the service worker) is not treated as fresh', () => {
    const old = new Date(T0 - 40 * MIN).toISOString();
    const memory = received(snapshotAt(old), T0);
    expect(datasetView(memory, 'tsunami', T0).kind).toBe('unavailable');
  });
});

describe('applyFetchResult', () => {
  it('keeps the previous snapshot on failure', () => {
    const before = received(snapshotAt(T0_ISO), T0);
    const after = applyFetchResult(before, { ok: false }, T0 + MIN);
    expect(after.snapshot).toBe(before.snapshot);
    expect(after.lastAttemptOk).toBe(false);
  });

  it('does not reset the receive time for the same version (304 / unchanged)', () => {
    const before = received(snapshotAt(T0_ISO), T0);
    const after = received(snapshotAt(T0_ISO), T0 + 5 * MIN, before);
    expect(after.receivedAt).toBe(T0);
    expect(after.lastAttemptOk).toBe(true);
  });

  it('ignores an older snapshot than the one already shown and counts it as a failed update', () => {
    const newer = received(snapshotAt(T0_ISO), T0);
    const older = new Date(T0 - 10 * MIN).toISOString();
    const after = received(snapshotAt(older), T0 + MIN, newer);
    expect(after.snapshot!.generatedAt).toBe(T0);
    expect(after.lastAttemptOk).toBe(false);
  });
});

describe('buildAlertBands', () => {
  const parsedItems = (raw: unknown) => parseSnapshot(raw)!;

  it('orders special > warning > advisory and pins major/regular tsunami warnings and extreme volcanoes', () => {
    const snap = parsedItems(
      snapshotAt(T0_ISO, {
        tsunami: dataset('ok', T0_ISO, [tsunami('advisory'), tsunami('warning'), tsunami('major_warning')]),
        volcano_warnings: dataset('ok', T0_ISO, [volcano('high'), volcano('extreme')]),
      })
    );
    const bands = buildAlertBands(snap.datasets.tsunami.items!, snap.datasets.volcano_warnings.items!);
    expect(bands.map((b) => `${b.source}:${b.tone}:${b.pinned}`)).toEqual([
      'tsunami:special:true',
      'volcano:special:true',
      'tsunami:warning:true',
      'tsunami:advisory:false',
    ]);
  });

  it('pins an unknown tsunami level as a warning (shown rather than missed)', () => {
    const snap = parsedItems(snapshotAt(T0_ISO, { tsunami: dataset('ok', T0_ISO, [tsunami('unknown')]) }));
    const [band] = buildAlertBands(snap.datasets.tsunami.items!, []);
    expect(band.tone).toBe('warning');
    expect(band.pinned).toBe(true);
  });

  it('keeps non-extreme volcanoes out of the bands (they go to the summary line)', () => {
    const snap = parsedItems(
      snapshotAt(T0_ISO, { volcano_warnings: dataset('ok', T0_ISO, [volcano('high'), volcano('advisory')]) })
    );
    expect(buildAlertBands([], snap.datasets.volcano_warnings.items!)).toEqual([]);
    expect(otherVolcanoes(snap.datasets.volcano_warnings.items!)).toHaveLength(2);
  });
});

describe('parseLangsParam', () => {
  it('defaults to en, zh, zh-TW, ko, ja', () => {
    expect(parseLangsParam('')).toEqual(['en', 'zh', 'zh-TW', 'ko', 'ja']);
    expect(DEFAULT_SIGNAGE_LANGS).toEqual(['en', 'zh', 'zh-TW', 'ko', 'ja']);
  });

  it('keeps the given order, normalises case, drops unknown and duplicates', () => {
    expect(parseLangsParam('?langs=ko, JA,xx,ko,zh-tw')).toEqual(['ko', 'ja', 'zh-TW']);
  });

  it('falls back to the default when nothing valid is given', () => {
    expect(parseLangsParam('?langs=xx,<script>')).toEqual(DEFAULT_SIGNAGE_LANGS);
    expect(parseLangsParam('?langs=')).toEqual(DEFAULT_SIGNAGE_LANGS);
  });
});

describe('formatting helpers', () => {
  it('formats JST time, adding the date when it is not the same JST day', () => {
    expect(formatJst(T0, T0)).toBe('14:30 JST');
    expect(formatJst(T0, T0 + 24 * 60 * MIN)).toBe('10/22 14:30 JST');
  });

  it('formats seismic intensity per language', () => {
    expect(formatIntensity('5弱', 'ja')).toBe('5弱');
    expect(formatIntensity('6強', 'en')).toBe('6+');
    expect(formatIntensity('5弱', 'ko')).toBe('5-');
    expect(formatIntensity('3', 'zh')).toBe('3');
  });

  it('names the region from the prefecture code', () => {
    expect(regionName('130000', 'ja')).toBe('東京都');
    expect(regionName('130000', 'en')).toBe('Tokyo');
    expect(regionName(null, 'en')).toBe('Japan');
  });

  it('prefers NEXT_PUBLIC_SITE_URL for the QR origin and ignores unusable values', () => {
    expect(resolveSignageOrigin('https://example.org/app', 'http://127.0.0.1:3400')).toBe('https://example.org');
    expect(resolveSignageOrigin('javascript:alert(1)', 'http://127.0.0.1:3400')).toBe('http://127.0.0.1:3400');
    expect(resolveSignageOrigin(undefined, 'http://127.0.0.1:3400')).toBe('http://127.0.0.1:3400');
  });
});

describe('quake items', () => {
  it('parses earthquake fields', () => {
    const snap = parseSnapshot(snapshotAt(T0_ISO, { earthquakes: dataset('ok', T0_ISO, [quake({ magnitude: null })]) }))!;
    expect(snap.datasets.earthquakes.items![0]).toMatchObject({ magnitude: null, maxIntensity: '5弱', locationJa: '千葉県東方沖' });
  });
});

describe('densityFlags (fitting without shrinking text)', () => {
  it('shows everything at level 0 with few bands', () => {
    expect(densityFlags(0, 2)).toEqual({
      hideSecondary: false,
      hideDetail: false,
      maxBands: 3,
      actionOnlyFirst: false,
      hideQuake: false,
      hideHeading: false,
    });
  });

  it('drops the second language from the start when 3 or more bands are shown', () => {
    expect(densityFlags(0, 3).hideSecondary).toBe(true);
  });

  it('removes less critical parts one level at a time, ending with the heading', () => {
    const at = (level: number) => densityFlags(level, 1);
    expect(at(1).hideSecondary).toBe(true);
    expect(at(1).hideDetail).toBe(false);
    expect(at(2).hideDetail).toBe(true);
    expect(at(3).maxBands).toBe(0);
    expect(at(4).actionOnlyFirst).toBe(true);
    expect(at(4).hideQuake).toBe(false);
    expect(at(5).hideQuake).toBe(true);
    expect(at(5).hideHeading).toBe(false);
    expect(at(MAX_DENSITY).hideHeading).toBe(true);
  });

  it('never hides pinned bands even when no other bands are allowed', () => {
    const snap = parseSnapshot(
      snapshotAt(T0_ISO, { tsunami: dataset('ok', T0_ISO, [tsunami('advisory'), tsunami('major_warning'), tsunami('warning')]) })
    )!;
    const { shown, hiddenCount } = limitBands(buildAlertBands(snap.datasets.tsunami.items!, []), 0);
    expect(shown.map((b) => b.tone)).toEqual(['special', 'warning']);
    expect(hiddenCount).toBe(1);
  });
});
