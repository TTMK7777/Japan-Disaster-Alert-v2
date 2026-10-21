import { normalizeSeverity } from '@/lib/warningSeverity';

/**
 * 選択中の地域に特別警報が出ているか（全タブ共通の帯を出す判定）。
 *
 * 入力は `/api/v1/alerts?area_code=` の応答（backend の `DisasterAlert[]`）。
 *
 * - 「出ている」の判定（気象庁 JSON の status）は backend が持つ。`発表` と `継続` だけを通し、
 *   `解除` と `発表警報・注意報はなし` は返さない（`warning_service.ACTIVE_WARNING_STATUSES`）。
 *   継続中の特別警報は `is_continuing=true` で返るが、**出ていることに変わりはない**ので帯を出す
 * - 特別警報は `severity="extreme"`（気象庁コード 32/33/35/36/37/38。`warning_names.CODE_SPEC`）。
 *   警報（high）・注意報（medium / low / advisory）では出さない
 * - 階級の読み替えは警報タブと同じ `normalizeSeverity` を使う（帯とカードで判定を分けない）
 *
 * 応答が想定外の形（配列でない・要素が壊れている）でも例外にせず false。
 * ただし**取得失敗を「特別警報なし」として扱うかは呼び出し側の責任**（帯を消さない）。
 */
export function hasActiveSpecialWarning(alerts: unknown): boolean {
  if (!Array.isArray(alerts)) return false;
  return alerts.some(
    (alert) =>
      typeof alert === 'object' &&
      alert !== null &&
      normalizeSeverity((alert as { severity?: unknown }).severity as string | undefined) === 'extreme'
  );
}
