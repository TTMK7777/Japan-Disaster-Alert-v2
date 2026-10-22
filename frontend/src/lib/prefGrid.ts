import { PREFECTURES } from '@/lib/prefectures';
import { estimatePrefectureCode } from '@/lib/geoPrefecture';

/**
 * 現在地 → 都道府県を、避難所データから作った 0.05° 格子表（public/data/pref-grid.json）で引く。
 *
 * 代表点の最近傍（lib/geoPrefecture.ts）は、同梱の避難所データ 115,674 件を正解にすると 88.4% しか当たらず
 * （愛知→静岡・宮城→岩手など）、誤った県を確定すると特別警報を見落とす。格子表は全件で 99.19%、
 * 半分で作って残り半分で測っても 99.03%（scripts/generate_pref_grid.py の出力）。
 *
 * - 表は「現在地から選ぶ」を押したときだけ**同じオリジンの静的ファイル**として取得する。
 *   URL は固定でクエリも無いので、**座標はリクエストに載らない**（外へ送らない約束を保つ）
 * - 表の取得に失敗したら代表点の最近傍に落とす（オフラインで SW のキャッシュも無い場合など）
 * - 引き方は生成スクリプトと同じ規則（変えるなら両方）:
 *   マス = floor(lat*20), floor(lon*20)。空なら半径 1〜5 マスの正方形で多数決（同数は小さい県コード）。
 *   5 マス以内に何も無ければ null（国外・遠い海上）
 */

export const PREF_GRID_URL = '/data/pref-grid.json';
export const MAX_RING = 5;

interface PrefGridFile {
  version: number;
  cellsPerDegree: number;
  rows: number[][];
}

export interface PrefGrid {
  cellsPerDegree: number;
  /** key = `${latIdx},${lonIdx}`、値 = 県コード（JIS 2 桁の数値 1..47） */
  cells: Map<string, number>;
}

const key = (i: number, j: number) => `${i},${j}`;

/** 符号化された表（緯度の行ごとに [latIdx, lonStart, code, len, ...]）を展開する。形が違えば例外 */
export function decodePrefGrid(raw: unknown): PrefGrid {
  const file = raw as PrefGridFile;
  if (
    !file ||
    file.version !== 1 ||
    !Number.isInteger(file.cellsPerDegree) ||
    file.cellsPerDegree <= 0 ||
    !Array.isArray(file.rows)
  ) {
    throw new Error('pref-grid: unexpected format');
  }
  const cells = new Map<string, number>();
  for (const row of file.rows) {
    if (!Array.isArray(row) || row.length < 4 || row.length % 2 !== 0) throw new Error('pref-grid: bad row');
    const [latIdx, lonStart] = row;
    let j = lonStart;
    for (let k = 2; k < row.length; k += 2) {
      const code = row[k];
      const len = row[k + 1];
      if (!Number.isInteger(code) || code < 0 || code > 47 || !Number.isInteger(len) || len <= 0) {
        throw new Error('pref-grid: bad run');
      }
      if (code !== 0) for (let n = 0; n < len; n++) cells.set(key(latIdx, j + n), code);
      j += len;
    }
  }
  return { cellsPerDegree: file.cellsPerDegree, cells };
}

function majority(counts: Map<number, number>): number {
  let best = -1;
  let bestCode = Number.POSITIVE_INFINITY;
  counts.forEach((n, code) => {
    if (n > best || (n === best && code < bestCode)) {
      best = n;
      bestCode = code;
    }
  });
  return bestCode;
}

/** 表で県コード（JIS の数値）を引く。見つからなければ null */
export function lookupJisCode(grid: PrefGrid, lat: number, lon: number): number | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const i = Math.floor(lat * grid.cellsPerDegree);
  const j = Math.floor(lon * grid.cellsPerDegree);
  const hit = grid.cells.get(key(i, j));
  if (hit !== undefined) return hit;
  for (let r = 1; r <= MAX_RING; r++) {
    const counts = new Map<number, number>();
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        const code = grid.cells.get(key(i + di, j + dj));
        if (code !== undefined) counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    if (counts.size > 0) return majority(counts);
  }
  return null;
}

/** JIS の県コード（1..47）を警報タブのセレクタのコードにする */
export function jisToPrefectureCode(jis: number | null): string | null {
  if (jis === null) return null;
  const prefix = String(jis).padStart(2, '0');
  return PREFECTURES.find((p) => p.code.startsWith(prefix))?.code ?? null;
}

let gridPromise: Promise<PrefGrid> | null = null;

/** 表を 1 回だけ取得する（成功したものだけ使い回す。失敗したら次回は取り直す） */
export function loadPrefGrid(): Promise<PrefGrid> {
  if (gridPromise === null) {
    gridPromise = fetch(PREF_GRID_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`pref-grid ${response.status}`);
        return response.json();
      })
      .then(decodePrefGrid)
      .catch((err) => {
        gridPromise = null;
        throw err;
      });
  }
  return gridPromise;
}

/** テスト用: 取得済みの表を捨てる */
export function resetPrefGridCache(): void {
  gridPromise = null;
}

/**
 * 現在地から警報タブのセレクタのコードを推定する。表が取れなければ代表点の最近傍に落とす。
 * 推定は候補であり、画面で利用者が確定する（components/RegionBar.tsx）。
 */
export async function estimatePrefecture(lat: number, lon: number): Promise<string | null> {
  try {
    const grid = await loadPrefGrid();
    return jisToPrefectureCode(lookupJisCode(grid, lat, lon));
  } catch (err) {
    console.warn('[pref-grid] 表を取得できないため代表点で推定します:', err);
    return estimatePrefectureCode(lat, lon);
  }
}
