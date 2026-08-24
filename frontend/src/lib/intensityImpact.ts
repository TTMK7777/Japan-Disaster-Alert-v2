/**
 * 震度に対して「交通やライフラインに何が起きるか」を返す。
 *
 * ## 根拠
 *
 * 気象庁「震度階級関連解説表」（平成21年3月31日改訂）の
 * **「ライフライン・インフラ等への影響」** の節に基づく。
 * https://www.jma.go.jp/jma/kishou/know/shindo/kaisetsu.html
 *
 * この節は解説表のなかで**唯一、震度で閾値が付いている**部分である。
 * 他の表（人の体感・屋内の状況・木造建物 等）は現象の記述で、
 * 「大規模構造物への影響」に至っては長周期地震動階級という別体系なので
 * 震度の閾値が存在しない。**震度と紐づけた時点で逸脱になる。**
 *
 * ## この実装が守っている線
 *
 * 1. **閾値は5項目だけ。** 空港・一般道・上下水道の復旧見込み・信号機・ATM・
 *    店舗・避難所開設は解説表に記載が無い。気象庁由来として出さない。
 * 2. **「程度以上」の曖昧さを保つ。** 厳密なカットオフではない。
 * 3. **原文の断定度を変えない。** 「〜する」（機器の仕様・事業者の運用ルール）と
 *    「〜することがある」（確率的な結果）は原文で打ち分けられている。
 * 4. **現象の記述を行動指示に変換しない。** 「エレベーターが自動停止する」は
 *    気象庁の記述だが、「エレベーターを使わないでください」はアプリ独自の助言であり
 *    出典が違う。ここでは**気象庁の記述だけ**を扱う（独自の助言は safety_guide が持つ）。
 * 5. 気象庁の留意事項(2)(4)を免責として同じ画面に置く（階によって揺れが違う／
 *    記載の全現象が起きるとは限らず、より大きい被害も小さい被害もありうる）。
 */

/** 影響項目のキー。翻訳表 IMPACT_TEXT のキーと対応する */
export type ImpactKey =
  | 'transit'         // 鉄道の停止、高速道路の規制等（震度4程度以上）
  | 'gas'             // ガス供給の停止（震度5弱程度以上）
  | 'utility'         // 断水、停電の発生（震度5弱程度以上）
  | 'elevator'        // エレベーターの停止（震度5弱程度以上）
  | 'messageService'  // 災害用伝言サービスの提供（震度6弱程度以上）
  | 'widespread';     // 広域でのガス・水道・電気の停止（震度6強程度以上）

/**
 * 震度階級を大小比較できる序数にする。
 * 未知の値（速報段階の "不明"、海外震源など）は null。
 */
const INTENSITY_ORDER: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5弱': 5,
  '5強': 6,
  '6弱': 7,
  '6強': 8,
  '7': 9,
};

/** 各項目が該当し始める震度（序数）。気象庁の閾値そのもの */
const THRESHOLDS: ReadonlyArray<{ key: ImpactKey; from: number }> = [
  { key: 'transit', from: INTENSITY_ORDER['4'] },
  { key: 'gas', from: INTENSITY_ORDER['5弱'] },
  { key: 'utility', from: INTENSITY_ORDER['5弱'] },
  { key: 'elevator', from: INTENSITY_ORDER['5弱'] },
  { key: 'messageService', from: INTENSITY_ORDER['6弱'] },
  { key: 'widespread', from: INTENSITY_ORDER['6強'] },
];

export function intensityRank(intensity: string): number | null {
  return INTENSITY_ORDER[intensity] ?? null;
}

/**
 * その震度で該当する影響項目を返す。
 *
 * **累積する。** 気象庁の記述は「震度4程度以上」「震度5弱程度以上」なので、
 * 震度7なら震度4の項目も該当したままになる。実際、震度7の場面で
 * 「電車が止まっているか」は利用者にとって最も切実な情報のひとつ
 * （訪日客の災害時ニーズ調査で日程の崩壊 37.3%・交通と空港の情報 22.2%）。
 *
 * 震度1〜3、および震度が判明していない場合は**空を返す**。
 * 閾値に届かないものを出せば誇張になり、震度不明で出せば根拠のない推定になる。
 */
export function impactsFor(intensity: string): ImpactKey[] {
  const rank = intensityRank(intensity);
  if (rank === null) return [];
  return THRESHOLDS.filter((t) => rank >= t.from).map((t) => t.key);
}

/** カード自体を出すかどうか */
export function hasImpact(intensity: string): boolean {
  return impactsFor(intensity).length > 0;
}
