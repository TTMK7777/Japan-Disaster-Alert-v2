import { describe, it, expect } from 'vitest';
import colors from 'tailwindcss/colors';
import {
  normalizeSeverity,
  SEVERITY_STYLES,
  cardClassName,
  metaClassName,
  badgeClassName,
  type WarningSeverity,
  type SeverityLayer,
} from '../warningSeverity';

/**
 * Tailwind のクラス名を実際の色に解決する。
 *
 * パレット側に hex をハードコードせず **tailwindcss/colors を正**とするのが要点。
 * クラス名を `bg-amber-50` から `bg-amber-200` に書き換えれば、このテストが引く色も
 * 一緒に変わってコントラスト比が再計算される。つまりクラス名の変更が検知される。
 * 解決できない綴りは throw させて、タイポが黙って通らないようにする。
 */
function resolve(token: string): [number, number, number] {
  const cls = token.replace(/^dark:/, '');
  const m = cls.match(/^(?:bg|text|border-l|border)-(.+)$/);
  if (!m) throw new Error(`クラス名の形式が想定外: ${token}`);
  const name = m[1];

  let hex: string | undefined;
  if (name === 'white') hex = colors.white;
  else if (name === 'black') hex = colors.black;
  else {
    const parts = name.match(/^([a-z]+)-(\d+)$/);
    if (!parts) throw new Error(`色トークンを解釈できない: ${token}`);
    const family = (colors as unknown as Record<string, Record<string, string>>)[parts[1]];
    hex = family?.[parts[2]];
  }
  if (!hex) throw new Error(`Tailwind パレットに存在しない色: ${token}`);

  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** WCAG 2.1 の相対輝度 */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 前景を alpha で背景に合成する。
 * 旧実装は `opacity-90` を使っており、実効コントラストは合成後の色で決まっていた。
 * この関数が無いと「旧実装が不合格だった」ことをテストで再現できない。
 */
function composite(fg: [number, number, number], bg: [number, number, number], alpha: number) {
  return fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as [number, number, number];
}

function contrast(a: string, b: string, alpha = 1): number {
  const bg = resolve(b);
  const fg = alpha === 1 ? resolve(a) : composite(resolve(a), bg, alpha);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** ページ地。main は bg-gray-50 dark:bg-gray-900 */
const PAGE = { light: 'bg-gray-50', dark: 'bg-gray-900' } as const;

const SEVERITIES: WarningSeverity[] = ['extreme', 'high', 'advisory', 'unknown'];
const THEMES = ['light', 'dark'] as const;

describe('警報バナーのパレット', () => {
  describe('WCAG 2.1 AA — 文字は 4.5:1 以上', () => {
    for (const severity of SEVERITIES) {
      for (const theme of THEMES) {
        const layer: SeverityLayer = SEVERITY_STYLES[severity][theme];

        it(`${severity} / ${theme}: 見出しと本文`, () => {
          expect(contrast(layer.text, layer.bg)).toBeGreaterThanOrEqual(4.5);
        });

        it(`${severity} / ${theme}: 地域名と時刻`, () => {
          // 従来ここが opacity-90 で 3.28:1 まで落ちていた
          expect(contrast(layer.meta, layer.bg)).toBeGreaterThanOrEqual(4.5);
        });

        it(`${severity} / ${theme}: 階級バッジ`, () => {
          expect(contrast(layer.badgeText, layer.badgeBg)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  });

  describe('WCAG 2.1 AA — 非テキストの識別子は 3:1 以上 (1.4.11)', () => {
    for (const severity of SEVERITIES) {
      for (const theme of THEMES) {
        const layer = SEVERITY_STYLES[severity][theme];
        if (!layer.accent) continue;
        const accent = layer.accent;

        it(`${severity} / ${theme}: 左アクセントがカード地から分離する`, () => {
          expect(contrast(accent, layer.bg)).toBeGreaterThanOrEqual(3);
        });

        it(`${severity} / ${theme}: 左アクセントがページ地から分離する`, () => {
          expect(contrast(accent, PAGE[theme])).toBeGreaterThanOrEqual(3);
        });
      }
    }
  });

  it('塗りつぶしカードは左アクセントを持たない（背景自体が符号のため）', () => {
    for (const severity of SEVERITIES) {
      const style = SEVERITY_STYLES[severity];
      for (const theme of THEMES) {
        expect(Boolean(style[theme].accent)).toBe(!style.filled);
      }
    }
  });

  it('カードの輪郭がページ地から 3:1 以上で分離する', () => {
    // ダークモードでは塗りつぶしカードの背景がページ地と 1.63:1 までしか離れない
    // （purple-900 対 gray-900）。輪郭を担保しているのは枠線なので、背景だけを見て
    // 判定すると偽陰性・偽陽性の両方が出る。3 つのうち最も強いもので判定する。
    for (const severity of SEVERITIES) {
      const style = SEVERITY_STYLES[severity];
      for (const theme of THEMES) {
        const layer = style[theme];
        const candidates = [layer.bg, layer.border, layer.accent].filter(Boolean) as string[];
        const best = Math.max(...candidates.map((c) => contrast(c, PAGE[theme])));
        expect(best, `${severity} / ${theme}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('ダーク側のトークンはすべて dark: 前置きされている', () => {
    for (const severity of SEVERITIES) {
      const dark = SEVERITY_STYLES[severity].dark;
      for (const [key, value] of Object.entries(dark)) {
        expect(value, `${severity}.dark.${key}`).toMatch(/^dark:/);
      }
    }
  });

  it('ライト側のトークンに dark: が混ざっていない', () => {
    for (const severity of SEVERITIES) {
      const light = SEVERITY_STYLES[severity].light;
      for (const [key, value] of Object.entries(light)) {
        expect(value, `${severity}.light.${key}`).not.toMatch(/^dark:/);
      }
    }
  });
});

describe('normalizeSeverity', () => {
  it('気象庁の 3 階級へ畳む', () => {
    expect(normalizeSeverity('extreme')).toBe('extreme');
    expect(normalizeSeverity('high')).toBe('high');
    expect(normalizeSeverity('medium')).toBe('advisory');
    expect(normalizeSeverity('low')).toBe('advisory');
  });

  it('medium と low は同じ見た目になる（どちらも気象庁の「注意報」）', () => {
    // 従来は medium=黄 / low=青 と別々に塗られ、ラベルだけ同じ「注意報」だった
    expect(normalizeSeverity('medium')).toBe(normalizeSeverity('low'));
    const a = SEVERITY_STYLES[normalizeSeverity('medium')];
    const b = SEVERITY_STYLES[normalizeSeverity('low')];
    expect(a).toBe(b);
  });

  it('未知・空・null を unknown に落とす', () => {
    expect(normalizeSeverity('')).toBe('unknown');
    expect(normalizeSeverity(null)).toBe('unknown');
    expect(normalizeSeverity(undefined)).toBe('unknown');
    expect(normalizeSeverity('critical')).toBe('unknown');
    expect(normalizeSeverity('緊急')).toBe('unknown');
  });

  it('大文字と前後の空白を吸収する', () => {
    expect(normalizeSeverity('HIGH')).toBe('high');
    expect(normalizeSeverity(' Medium ')).toBe('advisory');
  });
});

describe('支援技術への割り込み', () => {
  it('警報以上だけが読み上げに割り込む', () => {
    // 注意報は 16 コードあり最頻出。全件に role="alert" を付けると読み上げが洪水になる
    expect(SEVERITY_STYLES.extreme.interrupts).toBe(true);
    expect(SEVERITY_STYLES.high.interrupts).toBe(true);
    expect(SEVERITY_STYLES.advisory.interrupts).toBe(false);
    expect(SEVERITY_STYLES.unknown.interrupts).toBe(false);
  });
});

describe('クラス列の生成', () => {
  it('カードのクラスにライトとダーク両方の背景が入る', () => {
    const cls = cardClassName('advisory');
    expect(cls).toContain('bg-amber-50');
    expect(cls).toContain('dark:bg-amber-950');
    expect(cls).toContain('border-l-4');
  });

  it('どのクラス列にも undefined が紛れ込まない', () => {
    for (const severity of SEVERITIES) {
      expect(cardClassName(severity)).not.toContain('undefined');
      expect(metaClassName(severity)).not.toContain('undefined');
      expect(badgeClassName(severity)).not.toContain('undefined');
    }
  });

  it('unknown はラベルを持たないのでバッジを描画しない合図になる', () => {
    expect(SEVERITY_STYLES.unknown.labelKey).toBeNull();
    for (const severity of ['extreme', 'high', 'advisory'] as const) {
      expect(SEVERITY_STYLES[severity].labelKey).toBeTruthy();
    }
  });
});

describe('回帰: 修正前のパレットは不合格だったこと', () => {
  // 旧実装は severity ごとにベタ塗り + 本文とメタ行に opacity-90 を掛けていた。
  // 実測値は 3.28〜4.27 で、いずれも AA (4.5:1) に届いていなかった。

  it('旧 low の bg-blue-500 は見出しの時点で不合格', () => {
    expect(contrast('text-white', 'bg-blue-500')).toBeLessThan(4.5);
  });

  it('旧 low の本文 (opacity-90) はさらに低い', () => {
    expect(contrast('text-white', 'bg-blue-500', 0.9)).toBeLessThan(3.5);
  });

  it('旧 high の bg-red-600 は見出しだけ合格し、本文 (opacity-90) で落ちていた', () => {
    // 見出しは 4.83 で通るので「赤は問題ない」と誤認しやすい。落ちていたのは本文とメタ行
    expect(contrast('text-white', 'bg-red-600')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('text-white', 'bg-red-600', 0.9)).toBeLessThan(4.5);
  });

  it('旧 default の bg-gray-500 も本文 (opacity-90) で落ちていた', () => {
    expect(contrast('text-white', 'bg-gray-500', 0.9)).toBeLessThan(4.5);
  });

  it('新パレットは opacity を使わないので、この劣化経路自体が無い', () => {
    for (const severity of SEVERITIES) {
      for (const theme of THEMES) {
        const layer = SEVERITY_STYLES[severity][theme];
        // alpha=1 で測った値がそのまま実効値になる
        expect(contrast(layer.meta, layer.bg)).toBe(contrast(layer.meta, layer.bg, 1));
      }
    }
  });

  it('解決できない色トークンは例外にする', () => {
    expect(() => contrast('bg-purpel-800', 'bg-white')).toThrow();
    expect(() => contrast('bg-amber-42', 'bg-white')).toThrow();
  });
});
