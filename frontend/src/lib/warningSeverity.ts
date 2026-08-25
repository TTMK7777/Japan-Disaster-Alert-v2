/**
 * 気象庁の警報階級と、その表示スタイル。
 *
 * ## なぜ severity をそのまま使わないか
 *
 * バックエンドの `CODE_SPEC` は気象庁の警報コードを 4 段階の severity に割り当てているが、
 * 気象庁の階級自体は 3 段階しかない。
 *
 * | JMA 階級 | level      | severity          | コード数 |
 * |----------|------------|-------------------|---------|
 * | 特別警報 | emergency  | extreme           | 6       |
 * | 警報     | warning    | high              | 7       |
 * | 注意報   | advisory   | **medium と low** | 10 + 6  |
 *
 * `medium` と `low` は**どちらも「注意報」**で、UI のラベルも同じ「注意報」を出している。
 * にもかかわらず従来は medium を黄、low を青で塗っていたため、**同じ階級のものが
 * 画面上で 2 色に分かれて**いた。日本語を読めない利用者にとって色は階級そのものの符号
 * なので、これは「違う重さのものが並んでいる」という誤った情報になる。
 * ここで 3 階級へ正規化して、表示と気象庁の階級を 1:1 に戻す。
 *
 * ## なぜ注意報だけ塗りつぶさないか
 *
 * 注意報は 16 コードあり実データで最も頻繁に出る。これを警報と同じくベタ塗りにすると
 * 画面が常時警告色で埋まり、本当に危険な特別警報・警報が埋没する。
 * 「ベタ塗り = 直ちに危険」という視覚的な符号を保つため、注意報は淡色カード +
 * 太い左ボーダーにして面積を落とす。色相は気象庁の注意報色に合わせて黄系のままにする。
 *
 * ## なぜ opacity と半透明背景を使わないか
 *
 * `opacity-90` や `bg-black/20` は下地と混ざるため、実効コントラストがクラス名から
 * 読み取れず、検証もしづらい。全レイヤーを不透明な実色トークンで表現している。
 * これにより `__tests__/warningSeverity.test.ts` が Tailwind の実パレットを参照して
 * 全組み合わせのコントラスト比を機械的に検証できる。
 *
 * ## 左ボーダーが物理プロパティである理由
 *
 * Tailwind 3.4.19 には論理プロパティ版の border ユーティリティ (`border-s-*`) が無い
 * （`inline-start` は inset / float / margin にしか実装されていない）。
 * 本アプリの対応 16 言語に RTL 言語は含まれないため物理の `border-l-*` で問題ないが、
 * RTL 言語を追加する場合はここを論理プロパティへ置き換える必要がある。
 */

export type WarningSeverity = 'extreme' | 'high' | 'advisory' | 'unknown';

/** バックエンドが返す severity 文字列を、気象庁の 3 階級 + 不明 に畳む。 */
export function normalizeSeverity(raw: string | null | undefined): WarningSeverity {
  switch (String(raw ?? '').toLowerCase().trim()) {
    case 'extreme':
      return 'extreme';
    case 'high':
      return 'high';
    // medium と low はどちらも気象庁の「注意報」。表示を分けない。
    case 'medium':
    case 'low':
      return 'advisory';
    default:
      return 'unknown';
  }
}

/**
 * 1 テーマ分の色トークン。値は Tailwind のクラス名そのもの
 * （dark 側は `dark:` 前置き済み）。テストが接頭辞を剥がして実パレットを引く。
 */
export interface SeverityLayer {
  /** カード背景 */
  bg: string;
  /** 見出しと本文。二次情報ではないので最も高いコントラストを取る */
  text: string;
  /** 地域名と時刻。opacity ではなく実色で階層を作る */
  meta: string;
  /** 階級ラベルのバッジ */
  badgeBg: string;
  badgeText: string;
  /**
   * カードの枠線の色。ダークモードでは塗りつぶしカードの背景がページ地
   * (gray-900) と 1.63:1 までしか離れないため、カードの輪郭を担保するのはこちら。
   */
  border: string;
  /** 淡色カードの左アクセント。塗りつぶしカードでは背景自体が符号なので持たない */
  accent?: string;
}

export interface SeverityStyle {
  light: SeverityLayer;
  dark: SeverityLayer;
  /** 枠線の太さ。淡色カードは左だけ太くして階級を示す */
  borderWidth: string;
  /** 塗りつぶし（＝直ちに危険）か */
  filled: boolean;
  /**
   * 支援技術に割り込むか。警報以上のみ true。
   * 注意報にも role="alert" を付けると、10 件並んだときに読み上げが洪水になる。
   */
  interrupts: boolean;
  icon: string;
  /** i18n キー。unknown は該当ラベルが無いのでバッジ自体を描画しない */
  labelKey: string | null;
}

export const SEVERITY_STYLES: Record<WarningSeverity, SeverityStyle> = {
  extreme: {
    light: {
      bg: 'bg-purple-800',
      text: 'text-white',
      meta: 'text-purple-100',
      badgeBg: 'bg-purple-950',
      badgeText: 'text-purple-100',
      border: 'border-purple-950',
    },
    dark: {
      bg: 'dark:bg-purple-900',
      text: 'dark:text-purple-50',
      meta: 'dark:text-purple-200',
      badgeBg: 'dark:bg-purple-950',
      badgeText: 'dark:text-purple-200',
      border: 'dark:border-purple-600',
    },
    borderWidth: 'border-2',
    filled: true,
    interrupts: true,
    icon: '🚨',
    labelKey: 'warning.specialWarning',
  },
  high: {
    light: {
      bg: 'bg-red-700',
      text: 'text-white',
      meta: 'text-red-100',
      badgeBg: 'bg-red-950',
      badgeText: 'text-red-100',
      border: 'border-red-950',
    },
    dark: {
      bg: 'dark:bg-red-900',
      text: 'dark:text-red-50',
      meta: 'dark:text-red-200',
      badgeBg: 'dark:bg-red-950',
      badgeText: 'dark:text-red-200',
      border: 'dark:border-red-600',
    },
    borderWidth: 'border-2',
    filled: true,
    interrupts: true,
    icon: '⚠️',
    labelKey: 'warning.severityWarning',
  },
  advisory: {
    light: {
      bg: 'bg-amber-50',
      text: 'text-amber-950',
      meta: 'text-amber-800',
      badgeBg: 'bg-amber-700',
      badgeText: 'text-white',
      border: 'border-amber-300',
      accent: 'border-l-amber-700',
    },
    dark: {
      bg: 'dark:bg-amber-950',
      text: 'dark:text-amber-50',
      meta: 'dark:text-amber-200',
      badgeBg: 'dark:bg-amber-500',
      badgeText: 'dark:text-amber-950',
      border: 'dark:border-amber-800',
      accent: 'dark:border-l-amber-500',
    },
    borderWidth: 'border-2 border-l-4',
    filled: false,
    interrupts: false,
    icon: 'ℹ️',
    labelKey: 'warning.advisory',
  },
  unknown: {
    light: {
      bg: 'bg-gray-100',
      text: 'text-gray-900',
      meta: 'text-gray-700',
      badgeBg: 'bg-gray-700',
      badgeText: 'text-white',
      border: 'border-gray-300',
      accent: 'border-l-gray-600',
    },
    dark: {
      bg: 'dark:bg-gray-800',
      text: 'dark:text-gray-50',
      meta: 'dark:text-gray-300',
      badgeBg: 'dark:bg-gray-300',
      badgeText: 'dark:text-gray-900',
      border: 'dark:border-gray-700',
      accent: 'dark:border-l-gray-400',
    },
    borderWidth: 'border-2 border-l-4',
    filled: false,
    interrupts: false,
    icon: '📢',
    labelKey: null,
  },
};

/** カード本体に渡すクラス列。Tailwind の走査は各リテラルを個別に拾うので結合は実行時でよい。 */
export function cardClassName(severity: WarningSeverity): string {
  const s = SEVERITY_STYLES[severity];
  return [
    s.light.bg, s.light.text, s.light.border,
    s.dark.bg, s.dark.text, s.dark.border,
    s.borderWidth, s.light.accent, s.dark.accent,
  ].filter(Boolean).join(' ');
}

export function metaClassName(severity: WarningSeverity): string {
  const s = SEVERITY_STYLES[severity];
  return `${s.light.meta} ${s.dark.meta}`;
}

export function badgeClassName(severity: WarningSeverity): string {
  const s = SEVERITY_STYLES[severity];
  return [s.light.badgeBg, s.light.badgeText, s.dark.badgeBg, s.dark.badgeText].join(' ');
}
