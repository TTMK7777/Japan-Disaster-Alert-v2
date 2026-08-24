/**
 * 全画面の緊急警報を「出すか / 出さないか」を決める純粋ロジック。
 *
 * この判断は誤ると両方向に実害が出る。出しすぎれば誤報として信頼を失い、
 * 出さなすぎれば最も助けが要る場面で沈黙する。UI から切り離して
 * テストで固定できるようにここへ置く。
 *
 * 元の実装は `demoAlerts: AlertData[] = []` という空配列で駆動されており、
 * fetch も SSE も無く **一度も表示されないコンポーネント**だった。
 */

/** バックエンドの TsunamiInfo.warning_level（backend/app/models.py） */
export type TsunamiWarningLevel = 'none' | 'advisory' | 'warning' | 'major_warning';

/** 画面表示の重大度。alertStyles のキーと対応する */
export type AlertSeverity = 'advisory' | 'warning' | 'emergency';

export interface TsunamiLike {
  id: string;
  warning_level: string;
  title?: string;
  title_en?: string | null;
  earthquake_location?: string;
  message?: string;
}

export interface ActiveAlert {
  id: string;
  severity: AlertSeverity;
  /** 抑制の判定に使う。id が同じでもレベルが上がれば別物として扱う */
  dismissKey: string;
  source: TsunamiLike;
}

/**
 * 気象庁の津波警報レベル -> 画面の重大度。
 *
 * `none`（津波の心配なし）は **null** を返す。ここで表示してしまうと
 * 「警報が無い」ことを全画面の警報として出すことになり、一度で信頼を失う。
 */
export function toSeverity(level: string): AlertSeverity | null {
  switch (level) {
    case 'major_warning': // 大津波警報
      return 'emergency';
    case 'warning': // 津波警報
      return 'warning';
    case 'advisory': // 津波注意報
      return 'advisory';
    case 'none':
    default:
      return null;
  }
}

/** 重大度の順序。数値が大きいほど重い */
const SEVERITY_RANK: Record<AlertSeverity, number> = {
  advisory: 1,
  warning: 2,
  emergency: 3,
};

export function severityRank(severity: AlertSeverity): number {
  return SEVERITY_RANK[severity];
}

/**
 * 複数の津波情報から、いま全画面で出すべき1件を選ぶ。
 *
 * - `none` は候補にしない
 * - 複数あるときは**最も重いもの**を採る（軽い方を見せて安心させない）
 * - 同じ重さなら先に来たものを採る（順序を安定させる）
 */
export function selectAlert(tsunamis: readonly TsunamiLike[]): ActiveAlert | null {
  let best: ActiveAlert | null = null;

  for (const t of tsunamis) {
    const severity = toSeverity(t.warning_level);
    if (severity === null) continue;

    if (best === null || severityRank(severity) > severityRank(best.severity)) {
      best = {
        id: t.id,
        severity,
        // **レベルを鍵に含める。** id だけで抑制すると、注意報を閉じたあとに
        // 同じ津波が大津波警報へ引き上げられても二度と表示されなくなる
        dismissKey: `${t.id}:${t.warning_level}`,
        source: t,
      };
    }
  }

  return best;
}

/**
 * 選ばれた警報を実際に表示するか。
 *
 * SSE は10秒間隔で届くので、利用者が閉じた直後に再表示すると
 * 画面を操作できなくなる。閉じたものは `dismissed` に記録して抑制する。
 * ただし抑制の鍵にレベルを含めているため、**引き上げは必ず貫通する**。
 */
export function shouldDisplay(
  alert: ActiveAlert | null,
  dismissed: ReadonlySet<string>
): boolean {
  if (alert === null) return false;
  return !dismissed.has(alert.dismissKey);
}

/**
 * 自動で閉じてよいか。
 *
 * 既存実装はカウントダウンがゼロになると自動的に閉じていた。
 * 全画面を占有してでも見てもらう設計なのに、見ていなくても消えるのでは
 * 意味がない。**津波の警報・大津波警報は自動で閉じない**。
 * 注意報は情報提供の色が濃いので自動で引っ込めてよい。
 */
export function canAutoDismiss(severity: AlertSeverity): boolean {
  return severity === 'advisory';
}
