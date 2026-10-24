# tailwindcss v4 への移行計画

作成日: 2026-10-24
ステータス: 計画のみ（着手判断待ち）

dependabot #92 が postcss-selector-parser のアラート（GHSA-rj75-hqrm-r3gf、moderate）を消すために
tailwindcss を 3.4 → 4.3 に上げようとして、CI で 37 件落ちた（閉じた）。
v3 のままではこのアラートは消えない（`tailwindcss@3.4.19` と `postcss-nested@6.2.0` が 6.x に固定）。
ビルド時に自分の CSS を解析するだけで外部入力は無いため、**アラートは許容**とし、移行は本計画で扱う。

一次資料: <https://tailwindcss.com/docs/upgrade-guide>

---

## 1. 着手前に決めること（ゲート）

**v4 は Safari 16.4+ / Chrome 111+ / Firefox 128+ が前提**（上記ガイド）。
iOS 16.3 以前の iPhone では CSS が崩れる。利用者は訪日客で、端末の更新状況は国によって差がある。

- 端末分布のデータはまだ無い（**未検証**）。公開後のアクセス解析か、宿でのヒアリングで確かめる
- 古い端末を切り捨てる判断が取れないうちは **v3.4 のまま**にする（ガイドも「古いブラウザが要るなら v3.4」としている）

## 2. 作業一覧（2026-10-24 の main で数えた）

| # | 内容 | 規模 |
|---|---|---|
| 1 | `postcss.config.js` の `tailwindcss` → `@tailwindcss/postcss`（依存の追加なので確認が要る）。`autoprefixer` は不要になる | 小 |
| 2 | `src/app/globals.css` の `@tailwind base/components/utilities` → `@import "tailwindcss"` | 小 |
| 3 | `tailwind.config.js` は自動では読まれない。`@config` で読むか CSS（`@theme`）へ移す。`content` に `src/**` 全体を入れている理由（コメント参照）を失わないこと | 小 |
| 4 | `darkMode: 'class'` → `@custom-variant dark (&:where(.dark, .dark *));`。`dark:` を使うファイルは 20 | 小 |
| 5 | 名前が 1 段ずれるクラス: `rounded` 15 / `outline-none` 25 / `shadow` 13 / `flex-shrink-0` 4 / `ring` 2 / `shadow-sm` 1 / `rounded-sm` 1 | 中 |
| 6 | 既定色の変更: 色指定の無い `border` が gray-200 → currentColor（素の `border`/`border-l` 等 35 か所）。`ring` は 3px blue → 1px currentColor | 中（見た目の確認が要る） |
| 7 | **色パレットが oklch になる**（`tailwindcss/colors` の値も oklch 文字列）。`src/lib/__tests__/warningSeverity.test.ts` は hex を前提にコントラスト比を計算しているので、oklch → sRGB の変換を足す。色そのものも少し変わるため、**警報バナーの WCAG AA（4.5:1）を計算し直す** | 中 |

公式の自動変換ツール（`@tailwindcss/upgrade`）は `npx` 経由で、この環境では使えない（CLAUDE.md）。

## 3. 検証

- `npm run test:run` / `tsc --noEmit` / `npm run build`（**CI はビルドを回さない**ので、PR で必ず手元実行）
- 実ブラウザでのスクショ比較（本体の各タブ・`/signage`・`/poster`・`/conversation`・オフライン画面、ライト／ダーク、390px）
- 特別警報・津波の帯の色とコントラスト
