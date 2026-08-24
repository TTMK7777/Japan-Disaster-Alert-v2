/**
 * 震度の配色が2箇所で食い違わないことを固定する。
 *
 * 震度の色は `app/globals.css` の `.intensity-*`（カードの帯）と
 * `IntensityGauge.tsx` の `INTENSITY_PALETTE`（バッジとゲージ）の
 * 2箇所に持たれている。以前これらは別々のパレットで、1枚のカードの中で
 * 同じ震度4が帯 #fae696 / バッジ #FDE047 と違う黄色で並んでいた。
 *
 * 加えて、震度の色は避難判断に使われるので **WCAG AA (4.5:1)** を満たす必要がある。
 * 以前は 震度2 / 5強 / 6弱 が白文字で 2.56 / 2.14 / 3.78 しかなく、
 * 「震度が上がるほど読めなくなる」状態だった。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { INTENSITY_PALETTE } from '../IntensityGauge';

// globals.css のクラス名 -> パレットのキー
const CLASS_TO_INTENSITY: Record<string, string> = {
  'intensity-1': '1',
  'intensity-2': '2',
  'intensity-3': '3',
  'intensity-4': '4',
  'intensity-5-lower': '5弱',
  'intensity-5-upper': '5強',
  'intensity-6-lower': '6弱',
  'intensity-6-upper': '6強',
  'intensity-7': '7',
};

/** `.intensity-4 { background-color: #fae696; color: #333; }` を読む。
 *  ダークモードや prefers-contrast の上書きを拾わないよう、
 *  セレクタが単独（`.dark ` などの前置きが無い）行だけを対象にする。 */
function parseBaseIntensityRules(css: string): Record<string, { bg: string; fg: string }> {
  const out: Record<string, { bg: string; fg: string }> = {};
  const re = /^\.(intensity-[\w-]+)\s*\{([^}]*)\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const body = m[2];
    const bg = /background-color:\s*([^;]+);/.exec(body)?.[1].trim();
    const fg = /(?:^|[^-])color:\s*([^;]+);/.exec(body.replace(/background-color:[^;]+;/, ''))?.[1].trim();
    if (bg && fg) out[m[1]] = { bg, fg };
  }
  return out;
}

const normalize = (c: string): string => {
  const named: Record<string, string> = { white: '#ffffff', black: '#000000' };
  const v = named[c.toLowerCase()] ?? c.toLowerCase();
  // #333 -> #333333
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map((x) => x + x).join('');
  return v;
};

// --- WCAG 2.1 相対輝度 ---
function luminance(hex: string): number {
  const h = normalize(hex).slice(1);
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const c = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf-8');
const cssRules = parseBaseIntensityRules(css);

describe('震度カラーの二重管理', () => {
  it('globals.css の 9 段階すべてを読めている', () => {
    // パーサが壊れて空になると、以下の比較が全部素通りしてしまう
    expect(Object.keys(cssRules).sort()).toEqual(Object.keys(CLASS_TO_INTENSITY).sort());
  });

  it.each(Object.entries(CLASS_TO_INTENSITY))(
    '%s の背景色が IntensityGauge と一致する',
    (className, intensity) => {
      const fromTs = INTENSITY_PALETTE[intensity as keyof typeof INTENSITY_PALETTE];
      expect(normalize(cssRules[className].bg)).toBe(normalize(fromTs.color));
    }
  );

  it.each(Object.entries(CLASS_TO_INTENSITY))(
    '%s の文字色が IntensityGauge と一致する',
    (className, intensity) => {
      const fromTs = INTENSITY_PALETTE[intensity as keyof typeof INTENSITY_PALETTE];
      expect(normalize(cssRules[className].fg)).toBe(normalize(fromTs.textColor));
    }
  );
});

describe('震度カラーのコントラスト', () => {
  it.each(Object.entries(CLASS_TO_INTENSITY))(
    '%s は WCAG AA (4.5:1) を満たす',
    (className) => {
      const { bg, fg } = cssRules[className];
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `${className}: 背景 ${bg} に対して文字 ${fg} のコントラストが ${ratio.toFixed(2)}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  );
});
