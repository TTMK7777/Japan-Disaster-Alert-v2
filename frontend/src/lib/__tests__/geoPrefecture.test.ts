import { describe, it, expect } from 'vitest';
import { estimatePrefectureCode, GEO_SEEDS, MAX_SEED_DISTANCE_KM } from '../geoPrefecture';
import { isPrefectureCode, PREFECTURES } from '../prefectures';

/**
 * 現在地 → 都道府県（警報タブのコード）を端末内だけで推定する。
 *
 * 座標は外へ送らない（逆ジオコーダ API を使わない）ため、代表点への最近傍で決める。
 * 境界付近は外れうるので画面では「候補」として出し、利用者が確定する。
 * ここでは主要な観光地・離島・県境の近くで、代表点の置き方が効いていることを固定する。
 */

const cases: [string, number, number, string][] = [
  ['東京駅', 35.681, 139.767, '130000'],
  ['新宿', 35.690, 139.700, '130000'],
  ['横浜', 35.444, 139.638, '140000'],
  ['箱根湯本（神奈川。静岡・山梨との境）', 35.233, 139.106, '140000'],
  ['熱海（静岡。神奈川との境）', 35.096, 139.072, '220000'],
  ['軽井沢（長野。群馬との境）', 36.348, 138.597, '200000'],
  ['京都・嵐山', 35.009, 135.667, '260000'],
  ['大阪・難波', 34.666, 135.501, '270000'],
  ['奈良公園', 34.685, 135.843, '290000'],
  ['広島・宮島', 34.296, 132.320, '340000'],
  ['札幌', 43.062, 141.354, '016000'],
  ['函館（北海道は代表コードで全予報区に広がる）', 41.768, 140.729, '016000'],
  ['知床・ウトロ', 44.066, 144.993, '016000'],
  ['那覇', 26.212, 127.679, '471000'],
  ['石垣島（沖縄の八重山地方も沖縄県として選ぶ）', 24.340, 124.156, '471000'],
  ['宮古島', 24.805, 125.281, '471000'],
  ['奄美大島（鹿児島の奄美地方も鹿児島県として選ぶ）', 28.377, 129.494, '460100'],
  ['屋久島', 30.335, 130.507, '460100'],
  ['対馬（長崎）', 34.203, 129.287, '420000'],
  ['壱岐（長崎。福岡に近い）', 33.749, 129.691, '420000'],
  ['父島（東京都小笠原村）', 27.094, 142.192, '130000'],
  ['八丈島（東京都）', 33.110, 139.789, '130000'],
  ['佐渡（新潟）', 38.018, 138.368, '150000'],
  ['名古屋', 35.170, 136.881, '230000'],
  ['福岡・博多', 33.590, 130.420, '400000'],
  ['仙台', 38.260, 140.882, '040000'],
  ['日光（栃木）', 36.750, 139.599, '090000'],
];

describe('estimatePrefectureCode — 国内の代表的な地点', () => {
  it.each(cases)('%s → %s', (_label, lat, lon, expected) => {
    expect(estimatePrefectureCode(lat, lon)).toBe(expected);
  });
});

describe('estimatePrefectureCode — 候補を出さない（手動選択に戻す）', () => {
  it.each([
    ['ソウル', 37.566, 126.978],
    ['釜山', 35.180, 129.075],
    ['台北', 25.033, 121.565],
    ['上海', 31.230, 121.474],
    ['ウラジオストク', 43.115, 131.885],
    ['ニューヨーク', 40.713, -74.006],
    ['太平洋上（東京から 600km 東）', 35.0, 146.5],
    ['赤道・本初子午線', 0, 0],
  ])('%s', (_label, lat, lon) => {
    expect(estimatePrefectureCode(lat, lon)).toBeNull();
  });

  it.each([
    ['NaN', Number.NaN, 139.7],
    ['Infinity', 35.6, Number.POSITIVE_INFINITY],
    ['緯度の範囲外', 91, 139.7],
    ['経度の範囲外', 35.6, 181],
  ])('不正な座標（%s）は null', (_label, lat, lon) => {
    expect(estimatePrefectureCode(lat, lon)).toBeNull();
  });
});

describe('代表点の表', () => {
  it('47 都道府県すべてに代表点がある（どの県も候補になりうる）', () => {
    const covered = new Set(GEO_SEEDS.map((s) => s.pref));
    expect(covered.size).toBe(47);
  });

  it('返すコードはすべて警報タブのセレクタにあるコード', () => {
    for (const seed of GEO_SEEDS) {
      // 代表点そのものの座標で引けば、その県になる
      const code = estimatePrefectureCode(seed.lat, seed.lon);
      expect(isPrefectureCode(code), `${seed.pref} ${seed.lat},${seed.lon}`).toBe(true);
      expect(code?.startsWith(seed.pref), `${seed.pref} ${seed.lat},${seed.lon}`).toBe(true);
    }
  });

  it('セレクタの全コードに対応する代表点がある', () => {
    for (const p of PREFECTURES) {
      expect(GEO_SEEDS.some((s) => p.code.startsWith(s.pref)), p.code).toBe(true);
    }
  });

  it('しきい値は 100km（遠い海上や国外を日本の県に寄せない）', () => {
    expect(MAX_SEED_DISTANCE_KM).toBe(100);
  });
});
