import { describe, it, expect } from 'vitest';
// dependabot の自動マージ（.github/workflows/dependabot-automerge.yml）が使う判定。
// CI が回すのは frontend の vitest なので、テストはここに置く
import { majorOf, findMajorChanges } from '../../../.github/scripts/major-bump.mjs';

/**
 * 2026-10 の #92 は「postcss-selector-parser を消す」名目のまま tailwindcss を 3 → 4 に上げていた。
 * 自動マージの判定は PR 名の依存の更新種別（removed = 空）しか見ておらず、auto-merge が付いた。
 * 直接依存のメジャー変化は package.json の差分そのもので判定する。
 */
describe('majorOf', () => {
  it.each([
    ['^3.4.1', '3'],
    ['~4.3.3', '4'],
    ['4.1.12', '4'],
    // 0.x はマイナーが破壊的変更（semver の慣習）
    ['^0.35.5', '0.35'],
    ['^10', '10'],
    // ^0.0.x は事実上の完全一致
    ['^0.0.3', '0.0.3'],
  ])('%s → %s', (range, major) => {
    expect(majorOf(range)).toBe(major);
  });

  // 上限の無い範囲・複合範囲は「同じメジャー」と言えない（v4 まで入る ^3 || ^4 等）
  it.each(['latest', '*', 'github:foo/bar', 'file:../x', '', '>=8.5.18', '^3.4.1 || ^4.0.0', '3.x', '1.2.3 - 2.0.0'])('解釈できない %s は null', (range) => {
    expect(majorOf(range)).toBeNull();
  });
});

describe('findMajorChanges', () => {
  const base = {
    dependencies: { next: '^15.5.27', react: '^19.0.1' },
    devDependencies: { tailwindcss: '^3.4.1', vitest: '^4.1.11' },
    overrides: { sharp: '^0.35.5' },
  };

  it('#92 の形（devDependencies の tailwindcss 3 → 4）を検出する', () => {
    const head = { ...base, devDependencies: { tailwindcss: '^4.3.3', vitest: '^4.1.11' } };
    expect(findMajorChanges(base, head)).toEqual(['devDependencies.tailwindcss: ^3.4.1 → ^4.3.3']);
  });

  it('マイナー・パッチだけなら空', () => {
    const head = {
      ...base,
      dependencies: { next: '^15.6.0', react: '^19.0.2' },
      devDependencies: { tailwindcss: '^3.4.19', vitest: '^4.1.12' },
    };
    expect(findMajorChanges(base, head)).toEqual([]);
  });

  it('overrides の 0.x のマイナー変化も検出する', () => {
    const head = { ...base, overrides: { sharp: '^0.36.0' } };
    expect(findMajorChanges(base, head)).toEqual(['overrides.sharp: ^0.35.5 → ^0.36.0']);
  });

  it('依存の追加は検出する（新しい依存は人が見る）', () => {
    const head = { ...base, dependencies: { ...base.dependencies, lodash: '^4.17.21' } };
    expect(findMajorChanges(base, head)).toEqual(['dependencies.lodash: (なし) → ^4.17.21']);
  });

  it('依存の削除は通す（削除で壊れるなら CI が落ちる）', () => {
    const head = { ...base, dependencies: { next: '^15.5.27' } };
    expect(findMajorChanges(base, head)).toEqual([]);
  });

  it('解釈できない範囲への変更は検出する（安全側）', () => {
    const head = { ...base, dependencies: { ...base.dependencies, react: 'latest' } };
    expect(findMajorChanges(base, head)).toEqual(['dependencies.react: ^19.0.1 → latest']);
  });

  it('同じ文字列のままなら解釈できなくても通す', () => {
    const b = { dependencies: { x: 'github:foo/bar' } };
    expect(findMajorChanges(b, b)).toEqual([]);
  });

  it('範囲を || で広げたら検出する（^3 → ^3 || ^4 で v4 が入る）', () => {
    const head = { ...base, devDependencies: { tailwindcss: '^3.4.1 || ^4.0.0', vitest: '^4.1.11' } };
    expect(findMajorChanges(base, head)).toEqual(['devDependencies.tailwindcss: ^3.4.1 → ^3.4.1 || ^4.0.0']);
  });

  it('上限の無い範囲への書き換えを検出する', () => {
    const head = { ...base, overrides: { sharp: '>=0.35.5' } };
    expect(findMajorChanges(base, head)).toEqual(['overrides.sharp: ^0.35.5 → >=0.35.5']);
  });

  it('ネストした overrides は中身が同じなら通す', () => {
    const b = { overrides: { foo: { '.': '1.0.0', bar: '2.0.0' } } };
    const h = { overrides: { foo: { '.': '1.0.0', bar: '2.0.0' } } };
    expect(findMajorChanges(b, h)).toEqual([]);
  });

  it('ネストした overrides の中身が変われば検出する', () => {
    const b = { overrides: { foo: { bar: '2.0.0' } } };
    const h = { overrides: { foo: { bar: '3.0.0' } } };
    expect(findMajorChanges(b, h)).toHaveLength(1);
  });

  it('出力に改行を含めない（Actions のワークフローコマンドとして解釈させない）', () => {
    const h = { dependencies: { 'x\n::error::y': '1.0.0\r\n::stop-commands::z' } };
    const lines = findMajorChanges({}, h);
    expect(lines).toHaveLength(1);
    for (const line of lines) expect(line).not.toMatch(/[\r\n]/);
  });

  it('セクション自体が無くても落ちない', () => {
    expect(findMajorChanges({}, { devDependencies: { vitest: '^4.1.12' } })).toEqual([
      'devDependencies.vitest: (なし) → ^4.1.12',
    ]);
  });

  it('セクションがオブジェクトでなければ止める', () => {
    expect(findMajorChanges(base, { ...base, dependencies: 'x' })).toEqual(['dependencies: (オブジェクトでない)']);
    expect(findMajorChanges(base, { ...base, devDependencies: ['vitest'] })).toEqual([
      'devDependencies: (オブジェクトでない)',
    ]);
  });
});
