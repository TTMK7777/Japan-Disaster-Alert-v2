// dependabot の自動マージ前に、package.json の直接依存がメジャーで変わっていないかを見る。
//
// 2026-10 の #92 は「postcss-selector-parser を消す」名目で tailwindcss を 3 → 4 に上げていた。
// fetch-metadata の update-type は PR 名の依存（removed = 空）しか表さず、メジャー除外をすり抜けた。
// 判定は frontend/src/__tests__/dependabot-major-guard.test.ts が固定している。
//
// 使い方: node major-bump.mjs <base の package.json> <head の package.json>
//   変化があれば一覧を出して exit 1。
// pull_request_target で動くため、このスクリプトは base のものを使い、head は JSON として読むだけにする。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides'];

/**
 * 範囲指定の「メジャー」。0.x はマイナーまで、0.0.x はパッチまで含める（caret の意味に合わせる）。
 * 単純な形（^ ~ = 付きの 1 つの版）以外は null。`^3 || ^4` や `>=8` は上限が広がりうるため
 * 「同じメジャー」とは言えない
 */
export function majorOf(range) {
  const m = String(range ?? '').match(/^\s*[\^~]?=?\s*v?(\d+)(?:\.(\d+)(?:\.(\d+))?)?(?:[-+][0-9A-Za-z.+-]*)?\s*$/);
  if (!m) return null;
  const [, major, minor, patch] = m;
  if (major !== '0') return major;
  if (minor === undefined) return null;
  if (minor !== '0') return `0.${minor}`;
  return patch === undefined ? null : `0.0.${patch}`;
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 改行を残すと、head 由来の文字列が Actions のワークフローコマンド（::error:: 等）として解釈される
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v)).replace(/\r/g, '\\r').replace(/\n/g, '\\n');

/** base → head で人が見るべき変化（メジャー変化・追加・解釈できない範囲への変更） */
export function findMajorChanges(base, head) {
  const changes = [];
  for (const section of SECTIONS) {
    const before = isPlainObject(base?.[section]) ? base[section] : {};
    const after = head?.[section];
    if (after === undefined) continue;
    if (!isPlainObject(after)) {
      if (!same(base?.[section], after)) changes.push(`${section}: (オブジェクトでない)`);
      continue;
    }
    for (const [name, next] of Object.entries(after)) {
      const prev = before[name];
      // overrides はネストしたオブジェクトも取れる。中身で比べる
      if (same(prev, next)) continue;
      const label = `${section}.${show(name)}: ${prev === undefined ? '(なし)' : show(prev)} → ${show(next)}`;
      if (typeof prev !== 'string' || typeof next !== 'string') {
        changes.push(label);
        continue;
      }
      const a = majorOf(prev);
      const b = majorOf(next);
      if (a === null || b === null || a !== b) changes.push(label);
    }
  }
  return changes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [basePath, headPath] = process.argv.slice(2);
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const changes = findMajorChanges(read(basePath), read(headPath));
  if (changes.length > 0) {
    console.log('直接依存のメジャー変化・追加があるため自動マージしない:');
    for (const c of changes) console.log(`  ${c}`);
    process.exit(1);
  }
  console.log('直接依存のメジャー変化なし');
}
