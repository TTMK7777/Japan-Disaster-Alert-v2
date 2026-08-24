/**
 * 地震の数値項目の表示整形。
 *
 * 気象庁・P2P 地震情報は「未確定」を欠損（キーが無い）ではなく **値 -1** で表す。
 * 震度速報の段階では規模も深さもまだ決まっていないため、素直に描画すると
 * 「M-1」「-1km」という物理的にありえない値が利用者に見える（実際に画面へ出ていた）。
 *
 * 値が無いことは em ダッシュで示す。「不明」を16言語ぶん用意する手もあるが、
 * 見出し（規模 / Magnitude）が隣にある短い数値欄では記号の方が伝わり、
 * 翻訳を増やさずに済む。
 */
export const UNDETERMINED = -1;

export function formatMagnitude(magnitude: number): string {
  return magnitude > UNDETERMINED ? `M${magnitude}` : '—';
}

export function formatDepth(depth: number): string {
  return depth > UNDETERMINED ? `${depth}km` : '—';
}
