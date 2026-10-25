# 引き継ぎ: CI・セキュリティ検査・文書整備（2026-10-25）

## 完了内容

- CI の frontend job に型チェック・本番ビルド・Chromium 導入・本番 E2E を追加。既存の backend/frontend unit job 名を維持。
- Playwright 既定設定も production 起動に統一。CI は専用 backend を localhost へ自動起動し、既存サーバーを流用しない。AI API キーは空にして試験中の AI 呼び出しを避ける。
- API URL は frontend job の環境で build/E2E に共通指定。ローカル Chrome 設定は共通設定を継承する。
- README/CLAUDE の古いテスト件数・コマンドを訂正。接点戦略の URL 指定・ページ構成・実装済み状態を更新し、ギャップ分析を歴史資料と明示した。CAP は現状未実装の将来候補、現在の snapshot は JSON。
- 本番公開・課金設定・外部共有は行っていない。母語話者による翻訳確認と、公開後の配信開始は残す。

## 検証

- 回帰テスト先書き: 変更前の Playwright 設定では2件失敗、変更後は3件成功。CI/ローカル両経路を検査。
- YAML を解析し7コマンドの順序・失敗を無視しない設定を確認。本番ビルドを除いた負例が落ちることも確認。
- Backend pytest: 1,658件成功。
- Frontend Vitest: 57ファイル・1,946件成功。
- CI 初回で ubuntu-latest が26.04へ進み、Playwright 1.58.2 の対応OS外でブラウザ導入が失敗。frontend runner を ubuntu-24.04 に固定。導入済み Playwright の対応OS表とCI runnerを照合する回帰テストで負例→緑を確認した。
- 型チェック・本番ビルド: 成功。
- production + Chrome E2E: CI と同じ2サーバー自動管理で35件成功。スキップなし。
- 独立レビュー: P1/P2 指摘なし。

## セキュリティ検査

正規配置 `~/.claude/security/security_scan.py` を使用。機密ファイルを読まず、検査結果に本文・資格値を含めない。

- 全追跡テキスト: 294ファイル。秘密名2件・バイナリ14件を除外。大容量/外部参照による除外は0件。
- 全文検査は既存 scanner の regex エンジンに安全な対象一覧を渡して実施。通常の CLI は変更差分を検査し、検査エラー・0ファイルを正常扱いしない。
- 全文の生検出は41件（critical13/high28）。全件をコード/ASTと照合し、下記の誤検知と確認。検査規則の無効化・例外追加はしていない。

| 規則 | 件数 | コードで確認した根拠 |
|---|---:|---|
| ETH-002 | 4 | Web Push 用 JSON 構築と避難所 CSV データ構築。攻撃 payload 生成ではない |
| SEC-012 | 4 | テスト内の固定 fixture とモック設定。実資格情報ではない |
| SEC-002 | 2 | コメントと nonce 付き固定テーマスクリプト。外部入力の埋め込みなし |
| SEC-004 | 3 | テストの RegExp.exec。OS コマンド実行ではない |
| SEC-017 | 28 | 翻訳文字列中の des と暗号 DES の大文字小文字を無視した一致 |

差分の正規 CLI 検査は検出0件。これは依存関係脆弱性の監査を代替するものではない。

## 作業の分離と残項目

開始時、元チェックアウトは `fix/security-next-undici-20261025` にあり、frontend/package.json と lock に未コミット更新があった。これらは別作業として保全し、main 起点の `codex/ci-quality-gates` / `.worktrees/ci-quality-gates` で作業した。元の更新を破棄・取り込み・コミットしていない。

次の判断待ちは本番 Cloud Run 公開・URL 確定と、その後のポスター最終出力・フィード配信開始。tailwind v4、CAP、embed/LINE/TWA、新しい交通情報 API、Sentry 等の拡張は今回の検証・CI整備と分け、既存の判断待ち方針を維持する。

参考: [Playwright CI](https://playwright.dev/docs/ci-intro)、[webServer](https://playwright.dev/docs/test-webserver)。
