import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decodePrefGrid,
  estimatePrefecture,
  lookupJisCode,
  jisToPrefectureCode,
  resetPrefGridCache,
  PREF_GRID_URL,
} from '../prefGrid';
import { estimatePrefectureCode } from '../geoPrefecture';

/**
 * 現在地 → 都道府県の格子表（public/data/pref-grid.json。scripts/generate_pref_grid.py の生成物）。
 *
 * 固定点は同梱の避難所データ（backend/data/shelters/shelters.json.gz）の**実在行**の座標で、
 * 県境の近く。最初の 8 点は代表点の最近傍（旧方式）では**別の県になっていた**点。
 */
const GRID_JSON = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'pref-grid.json'), 'utf-8'));
const GRID = decodePrefGrid(GRID_JSON);

// [ラベル（避難所 ID）, lat, lon, 期待するセレクタのコード]
const BORDER_POINTS: [string, number, number, string][] = [
  ['愛知・豊橋 立合公園 E2320100001201', 34.74998, 137.396422, '230000'],
  ['三重・桑名 安永第二公園 E2420500001201', 35.048508, 136.675917, '240000'],
  ['宮城・気仙沼 磯草高台 E0420500050201', 38.873143, 141.60553, '040000'],
  ['岡山・笠岡 市立陶山小学校 E3320500001201', 34.530999, 133.458976, '330000'],
  ['神奈川・川崎 殿町小学校 E1413000094201', 35.537549, 139.745303, '140000'],
  ['兵庫・尼崎 大島小学校 E2820200001201', 34.733873, 135.385466, '280000'],
  ['佐賀・鳥栖 弥生が丘小学校 E4120300030201', 33.407072, 130.516649, '410000'],
  ['京都・八幡 美濃山コミュニティセンター E2621000005201', 34.841401, 135.713046, '260000'],
  ['岩手・一関 E0320900001201', 38.794662, 141.226147, '030000'],
  ['埼玉・川口 E1120300002201', 35.851799, 139.759489, '110000'],
];

describe('格子表（実データの県境の固定点）', () => {
  it.each(BORDER_POINTS)('%s', (_label, lat, lon, expected) => {
    expect(jisToPrefectureCode(lookupJisCode(GRID, lat, lon))).toBe(expected);
  });

  it('最初の 8 点は旧方式（代表点の最近傍）では外れていた（このテストが改善を測っている）', () => {
    const wrong = BORDER_POINTS.slice(0, 8).filter(([, lat, lon, expected]) => estimatePrefectureCode(lat, lon) !== expected);
    expect(wrong).toHaveLength(8);
  });

  it('離島も引ける（石垣・奄美・父島・対馬）。北海道・鹿児島・沖縄はセレクタの代表コード', () => {
    expect(jisToPrefectureCode(lookupJisCode(GRID, 24.34, 124.156))).toBe('471000');
    expect(jisToPrefectureCode(lookupJisCode(GRID, 28.377, 129.494))).toBe('460100');
    expect(jisToPrefectureCode(lookupJisCode(GRID, 27.094, 142.192))).toBe('130000');
    expect(jisToPrefectureCode(lookupJisCode(GRID, 34.203, 129.287))).toBe('420000');
    expect(jisToPrefectureCode(lookupJisCode(GRID, 43.062, 141.354))).toBe('016000');
  });

  it.each([
    ['ソウル', 37.566, 126.978],
    ['釜山', 35.18, 129.075],
    ['台北', 25.033, 121.565],
    ['太平洋上', 35.0, 146.5],
    ['NaN', Number.NaN, 139.7],
  ])('国外・海上・不正な値（%s）は null', (_label, lat, lon) => {
    expect(lookupJisCode(GRID, lat, lon)).toBeNull();
  });
});

describe('decodePrefGrid / lookupJisCode（規則）', () => {
  const tiny = decodePrefGrid({ version: 1, cellsPerDegree: 20, rows: [[700, 2780, 13, 2, 0, 1, 14, 1]] });

  it('連続を展開し、0 は空きにする', () => {
    expect(tiny.cells.get('700,2780')).toBe(13);
    expect(tiny.cells.get('700,2781')).toBe(13);
    expect(tiny.cells.has('700,2782')).toBe(false);
    expect(tiny.cells.get('700,2783')).toBe(14);
  });

  it('空きマスは周囲の多数決、同数は小さい県コード', () => {
    // (700,2782) の周囲 1 マス: 13 が 1、14 が 1 → 同数 → 13
    expect(lookupJisCode(tiny, 700.5 / 20, 2782.5 / 20)).toBe(13);
  });

  it('5 マスより遠ければ null', () => {
    expect(lookupJisCode(tiny, 700.5 / 20, (2783 + 6.5) / 20)).toBeNull();
    expect(lookupJisCode(tiny, 700.5 / 20, (2783 + 5.5) / 20)).toBe(14);
  });

  it.each([
    ['null', null],
    ['版が違う', { version: 2, cellsPerDegree: 20, rows: [] }],
    ['rows が無い', { version: 1, cellsPerDegree: 20 }],
    ['県コードが範囲外', { version: 1, cellsPerDegree: 20, rows: [[1, 1, 48, 1]] }],
    ['長さが 0', { version: 1, cellsPerDegree: 20, rows: [[1, 1, 13, 0]] }],
  ])('形が違う表（%s）は例外（推定側でフォールバックさせる）', (_label, raw) => {
    expect(() => decodePrefGrid(raw)).toThrow();
  });
});

describe('estimatePrefecture（取得とフォールバック）', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetPrefGridCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetPrefGridCache();
  });

  it('同じオリジンの固定 URL を 1 回だけ取りに行き、URL にも引数にも座標を載せない', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => GRID_JSON });
    const [lat, lon] = [34.74998, 137.396422];
    expect(await estimatePrefecture(lat, lon)).toBe('230000');
    expect(await estimatePrefecture(35.048508, 136.675917)).toBe('240000');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([PREF_GRID_URL]);
    const sent = JSON.stringify(fetchMock.mock.calls);
    for (const v of ['34.7', '137.3', '35.0', '136.6']) expect(sent).not.toContain(v);
  });

  it.each([
    ['ネットワーク失敗', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['404', () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) })],
    ['壊れた表', () => Promise.resolve({ ok: true, json: async () => ({ version: 9 }) })],
  ])('表が取れない（%s）なら代表点の最近傍に落とす', async (_label, impl) => {
    fetchMock.mockImplementation(impl);
    // 石垣島: 代表点でも沖縄県になる
    expect(await estimatePrefecture(24.34, 124.156)).toBe('471000');
    expect(await estimatePrefecture(37.566, 126.978)).toBeNull();
  });

  it('失敗した取得は使い回さず、次の押下で取り直す', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await estimatePrefecture(35.68, 139.76);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => GRID_JSON });
    expect(await estimatePrefecture(34.74998, 137.396422)).toBe('230000');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
