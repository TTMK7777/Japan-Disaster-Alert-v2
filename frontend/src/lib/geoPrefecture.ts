import { PREFECTURES } from '@/lib/prefectures';

/**
 * 現在地（緯度経度）から警報タブの都道府県コードを**端末内だけで**推定する。
 *
 * ## なぜ逆ジオコーダ API を使わないか
 *
 * 座標は利用者の居場所そのもの。外部へ送ると、どこに泊まっているかを第三者に渡すことになる。
 * 都道府県の粒度で足りるので、ここに置いた代表点（県庁所在地＋主要な観光地・空港・離島）の
 * **最近傍**で決める。境界データ（ポリゴン）は持たない（数 MB になり依存も増える）。
 *
 * ## 精度の前提
 *
 * 最近傍は**県境の近くで外れうる**。そのため画面では「候補」として出し、利用者が確定する
 * （components/RegionPicker.tsx）。代表点は県境に近い観光地（箱根・熱海・軽井沢・舞浜・空港など）を
 * 厚めに置いて、よく使われる場所での取り違えを減らしている。座標は概略値（小数 2 桁程度）。
 *
 * ## 北海道・鹿児島・沖縄
 *
 * 気象庁の府県予報区は北海道 8・鹿児島 2・沖縄 4 に分かれるが、警報タブのセレクタは都道府県単位で、
 * 代表コード（016000 / 460100 / 471000）を backend が全予報区に広げて取る（expand_to_offices）。
 * そのため石垣島でも沖縄県（471000）を返す。予報区のコード（474000 等）を返すとセレクタに無く、選べない。
 *
 * ## 候補を出さない場合
 *
 * 最寄りの代表点まで `MAX_SEED_DISTANCE_KM` を超えたら null（国外・遠い海上）。
 * 釜山（対馬から約 110km）や台北（与那国から約 160km）を日本の県に寄せないための値。
 */

export interface GeoSeed {
  /** 都道府県コード（JIS X 0401 の 2 桁） */
  pref: string;
  lat: number;
  lon: number;
}

export const MAX_SEED_DISTANCE_KM = 100;

// prettier-ignore
export const GEO_SEEDS: readonly GeoSeed[] = [
  // 北海道（広いので主要都市・観光地・離島の玄関を並べる）
  { pref: '01', lat: 43.06, lon: 141.35 }, // 札幌
  { pref: '01', lat: 43.77, lon: 142.36 }, // 旭川
  { pref: '01', lat: 41.77, lon: 140.73 }, // 函館
  { pref: '01', lat: 41.87, lon: 140.13 }, // 江差
  { pref: '01', lat: 42.32, lon: 140.97 }, // 室蘭
  { pref: '01', lat: 42.17, lon: 142.77 }, // 浦河
  { pref: '01', lat: 42.92, lon: 143.20 }, // 帯広
  { pref: '01', lat: 42.98, lon: 144.38 }, // 釧路
  { pref: '01', lat: 43.33, lon: 145.58 }, // 根室
  { pref: '01', lat: 44.02, lon: 144.27 }, // 網走
  { pref: '01', lat: 44.07, lon: 144.99 }, // 知床（ウトロ）
  { pref: '01', lat: 43.94, lon: 141.64 }, // 留萌
  { pref: '01', lat: 45.41, lon: 141.67 }, // 稚内
  { pref: '02', lat: 40.82, lon: 140.74 }, // 青森
  { pref: '02', lat: 40.51, lon: 141.49 }, // 八戸
  { pref: '02', lat: 40.60, lon: 140.46 }, // 弘前
  { pref: '03', lat: 39.70, lon: 141.15 }, // 盛岡
  { pref: '03', lat: 39.64, lon: 141.95 }, // 宮古
  { pref: '03', lat: 38.93, lon: 141.13 }, // 一関
  { pref: '04', lat: 38.27, lon: 140.87 }, // 仙台
  { pref: '05', lat: 39.72, lon: 140.10 }, // 秋田
  { pref: '05', lat: 39.31, lon: 140.55 }, // 横手
  { pref: '05', lat: 40.27, lon: 140.56 }, // 大館
  { pref: '06', lat: 38.24, lon: 140.36 }, // 山形
  { pref: '06', lat: 38.91, lon: 139.84 }, // 酒田
  { pref: '06', lat: 37.92, lon: 140.12 }, // 米沢
  { pref: '07', lat: 37.75, lon: 140.47 }, // 福島
  { pref: '07', lat: 37.40, lon: 140.38 }, // 郡山
  { pref: '07', lat: 37.49, lon: 139.93 }, // 会津若松
  { pref: '07', lat: 37.05, lon: 140.89 }, // いわき
  { pref: '08', lat: 36.34, lon: 140.45 }, // 水戸
  { pref: '08', lat: 36.08, lon: 140.11 }, // つくば
  { pref: '08', lat: 36.60, lon: 140.65 }, // 日立
  { pref: '09', lat: 36.57, lon: 139.88 }, // 宇都宮
  { pref: '09', lat: 36.75, lon: 139.60 }, // 日光
  { pref: '09', lat: 37.02, lon: 139.98 }, // 那須
  { pref: '10', lat: 36.39, lon: 139.06 }, // 前橋
  { pref: '10', lat: 36.32, lon: 139.00 }, // 高崎
  { pref: '10', lat: 36.62, lon: 138.60 }, // 草津
  { pref: '11', lat: 35.86, lon: 139.65 }, // さいたま
  { pref: '11', lat: 35.93, lon: 139.49 }, // 川越
  { pref: '11', lat: 35.99, lon: 139.09 }, // 秩父
  { pref: '12', lat: 35.61, lon: 140.12 }, // 千葉
  { pref: '12', lat: 35.63, lon: 139.88 }, // 浦安（舞浜。東京都との境）
  { pref: '12', lat: 35.77, lon: 140.39 }, // 成田空港
  { pref: '12', lat: 35.73, lon: 140.83 }, // 銚子
  { pref: '12', lat: 34.99, lon: 139.87 }, // 館山
  { pref: '13', lat: 35.69, lon: 139.69 }, // 東京（都庁）
  { pref: '13', lat: 35.67, lon: 139.82 }, // 江東（千葉県との境）
  { pref: '13', lat: 35.55, lon: 139.78 }, // 羽田空港
  { pref: '13', lat: 35.66, lon: 139.32 }, // 八王子
  { pref: '13', lat: 34.75, lon: 139.36 }, // 伊豆大島
  { pref: '13', lat: 34.08, lon: 139.53 }, // 三宅島
  { pref: '13', lat: 33.11, lon: 139.79 }, // 八丈島
  { pref: '13', lat: 27.09, lon: 142.19 }, // 父島（小笠原）
  { pref: '14', lat: 35.45, lon: 139.64 }, // 横浜
  { pref: '14', lat: 35.53, lon: 139.70 }, // 川崎（東京都との境）
  { pref: '14', lat: 35.26, lon: 139.16 }, // 小田原（箱根の玄関）
  { pref: '15', lat: 37.90, lon: 139.02 }, // 新潟
  { pref: '15', lat: 37.45, lon: 138.85 }, // 長岡
  { pref: '15', lat: 37.15, lon: 138.24 }, // 上越
  { pref: '15', lat: 36.93, lon: 138.81 }, // 湯沢
  { pref: '15', lat: 38.02, lon: 138.37 }, // 佐渡
  { pref: '16', lat: 36.70, lon: 137.21 }, // 富山
  { pref: '17', lat: 36.59, lon: 136.63 }, // 金沢
  { pref: '17', lat: 37.39, lon: 136.90 }, // 輪島
  { pref: '18', lat: 36.07, lon: 136.22 }, // 福井
  { pref: '19', lat: 35.66, lon: 138.57 }, // 甲府
  { pref: '19', lat: 35.49, lon: 138.81 }, // 富士吉田（河口湖）
  { pref: '20', lat: 36.65, lon: 138.18 }, // 長野
  { pref: '20', lat: 36.24, lon: 137.97 }, // 松本
  { pref: '20', lat: 36.34, lon: 138.63 }, // 軽井沢（群馬県との境）
  { pref: '20', lat: 36.70, lon: 137.86 }, // 白馬
  { pref: '20', lat: 35.51, lon: 137.82 }, // 飯田
  { pref: '21', lat: 35.39, lon: 136.72 }, // 岐阜
  { pref: '21', lat: 36.15, lon: 137.25 }, // 高山
  { pref: '21', lat: 36.26, lon: 136.91 }, // 白川郷
  { pref: '22', lat: 34.98, lon: 138.38 }, // 静岡
  { pref: '22', lat: 34.97, lon: 139.10 }, // 伊東（熱海の南。神奈川県との境）
  { pref: '22', lat: 34.68, lon: 138.95 }, // 下田
  { pref: '22', lat: 35.31, lon: 138.93 }, // 御殿場
  { pref: '22', lat: 35.22, lon: 138.62 }, // 富士宮
  { pref: '22', lat: 34.71, lon: 137.73 }, // 浜松
  { pref: '23', lat: 35.18, lon: 136.91 }, // 名古屋
  { pref: '23', lat: 34.86, lon: 136.81 }, // 中部国際空港
  { pref: '24', lat: 34.73, lon: 136.51 }, // 津
  { pref: '24', lat: 34.49, lon: 136.71 }, // 伊勢
  { pref: '24', lat: 34.07, lon: 136.19 }, // 尾鷲
  { pref: '25', lat: 35.00, lon: 135.87 }, // 大津
  { pref: '26', lat: 35.02, lon: 135.76 }, // 京都
  { pref: '26', lat: 35.47, lon: 135.39 }, // 舞鶴
  { pref: '27', lat: 34.69, lon: 135.52 }, // 大阪
  { pref: '27', lat: 34.43, lon: 135.23 }, // 関西国際空港（和歌山県に近い）
  { pref: '28', lat: 34.69, lon: 135.18 }, // 神戸
  { pref: '28', lat: 34.82, lon: 134.69 }, // 姫路
  { pref: '28', lat: 35.62, lon: 134.81 }, // 城崎
  { pref: '28', lat: 34.34, lon: 134.89 }, // 洲本（淡路島）
  { pref: '29', lat: 34.69, lon: 135.83 }, // 奈良
  { pref: '29', lat: 34.36, lon: 135.86 }, // 吉野
  { pref: '30', lat: 34.23, lon: 135.17 }, // 和歌山
  { pref: '30', lat: 34.21, lon: 135.59 }, // 高野山
  { pref: '30', lat: 33.68, lon: 135.35 }, // 白浜
  { pref: '30', lat: 33.72, lon: 135.99 }, // 新宮
  { pref: '31', lat: 35.50, lon: 134.24 }, // 鳥取
  { pref: '31', lat: 35.43, lon: 133.33 }, // 米子
  { pref: '32', lat: 35.47, lon: 133.05 }, // 松江
  { pref: '32', lat: 35.37, lon: 132.75 }, // 出雲
  { pref: '32', lat: 34.68, lon: 131.84 }, // 益田
  { pref: '32', lat: 36.21, lon: 133.32 }, // 隠岐
  { pref: '33', lat: 34.66, lon: 133.93 }, // 岡山
  { pref: '34', lat: 34.40, lon: 132.46 }, // 広島
  { pref: '34', lat: 34.49, lon: 133.36 }, // 福山
  { pref: '35', lat: 34.19, lon: 131.47 }, // 山口
  { pref: '35', lat: 33.96, lon: 130.94 }, // 下関
  { pref: '36', lat: 34.07, lon: 134.56 }, // 徳島
  { pref: '37', lat: 34.34, lon: 134.04 }, // 高松
  { pref: '38', lat: 33.84, lon: 132.77 }, // 松山
  { pref: '38', lat: 33.22, lon: 132.56 }, // 宇和島
  { pref: '39', lat: 33.56, lon: 133.53 }, // 高知
  { pref: '39', lat: 32.99, lon: 132.93 }, // 四万十
  { pref: '39', lat: 33.29, lon: 134.15 }, // 室戸
  { pref: '40', lat: 33.61, lon: 130.42 }, // 福岡
  { pref: '40', lat: 33.88, lon: 130.88 }, // 北九州
  { pref: '41', lat: 33.25, lon: 130.30 }, // 佐賀
  { pref: '42', lat: 32.75, lon: 129.87 }, // 長崎
  { pref: '42', lat: 33.18, lon: 129.72 }, // 佐世保
  { pref: '42', lat: 32.70, lon: 128.84 }, // 五島（福江）
  { pref: '42', lat: 33.79, lon: 129.72 }, // 壱岐
  { pref: '42', lat: 34.20, lon: 129.29 }, // 対馬（厳原）
  { pref: '43', lat: 32.79, lon: 130.74 }, // 熊本
  { pref: '43', lat: 32.95, lon: 131.10 }, // 阿蘇
  { pref: '43', lat: 32.46, lon: 130.19 }, // 天草
  { pref: '44', lat: 33.24, lon: 131.61 }, // 大分
  { pref: '44', lat: 33.28, lon: 131.49 }, // 別府
  { pref: '45', lat: 31.91, lon: 131.42 }, // 宮崎
  { pref: '45', lat: 32.71, lon: 131.31 }, // 高千穂
  { pref: '45', lat: 32.58, lon: 131.67 }, // 延岡
  { pref: '46', lat: 31.56, lon: 130.56 }, // 鹿児島
  { pref: '46', lat: 31.74, lon: 130.76 }, // 霧島
  { pref: '46', lat: 30.73, lon: 131.00 }, // 種子島
  { pref: '46', lat: 30.36, lon: 130.53 }, // 屋久島
  { pref: '46', lat: 28.38, lon: 129.49 }, // 奄美大島
  { pref: '46', lat: 27.73, lon: 128.97 }, // 徳之島
  { pref: '46', lat: 27.05, lon: 128.42 }, // 与論島
  { pref: '47', lat: 26.21, lon: 127.68 }, // 那覇
  { pref: '47', lat: 26.59, lon: 127.98 }, // 名護
  { pref: '47', lat: 26.34, lon: 126.80 }, // 久米島
  { pref: '47', lat: 24.80, lon: 125.28 }, // 宮古島
  { pref: '47', lat: 24.34, lon: 124.16 }, // 石垣島
  { pref: '47', lat: 24.47, lon: 123.00 }, // 与那国島
  { pref: '47', lat: 25.83, lon: 131.23 }, // 南大東島
];

const KM_PER_DEGREE = 111.32;

/** 近距離用の正距円筒近似（km）。100km 程度の比較には十分 */
function approxDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const meanLatRad = (((lat1 + lat2) / 2) * Math.PI) / 180;
  const dy = (lat1 - lat2) * KM_PER_DEGREE;
  const dx = (lon1 - lon2) * KM_PER_DEGREE * Math.cos(meanLatRad);
  return Math.sqrt(dx * dx + dy * dy);
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/**
 * 緯度経度から都道府県（警報タブのセレクタのコード）の候補を返す。
 * 不正な座標・国外・遠い海上は null（＝候補なし。手動選択に戻す）。
 */
export function estimatePrefectureCode(lat: number, lon: number): string | null {
  if (!isValidCoordinate(lat, lon)) return null;
  let best: GeoSeed | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const seed of GEO_SEEDS) {
    const km = approxDistanceKm(lat, lon, seed.lat, seed.lon);
    if (km < bestKm) {
      bestKm = km;
      best = seed;
    }
  }
  if (best === null || bestKm > MAX_SEED_DISTANCE_KM) return null;
  const pref = best.pref;
  return PREFECTURES.find((p) => p.code.startsWith(pref))?.code ?? null;
}
