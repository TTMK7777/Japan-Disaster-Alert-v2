# STATUS — プロジェクト現在地

## 現在地（2026-09-12 棚卸し）
- 状態: 出荷準備（機能面はほぼ完成、公開 URL 未確定が唯一のブロッカー）
- 現在地: 地震・気象・噴火警報・避難所検索・PWA・プッシュ通知・WCAG 2.1 AA まで実装済み。CHANGELOG の [Unreleased] に交通情報源の 16 言語対応を追加中。
- 最終作業: 2026-09-11 fix(security): next/sharp を修正版へ更新 (Dependabot #60,#61,#62) (#87)
- 次の一手: バックログの最適化タスク（AsyncClient 共有化 / push_service のバッチ化 / EarthquakeList の React.memo / Pydantic V2 ConfigDict 移行 / Push 通知 UI 拡張 / `scripts/generate-icons.js` 削除検討）。open issue 0 件 / open PR 0 件。
- 判断待ち: 本番デプロイ（`gcloud run deploy`）の実行と公開 URL の確定はオーナー判断。

## 補足
- 詳細なタスク一覧はローカル限定の `todo.md`（`.gitignore` 済み・リポジトリには含まれない）にあります。
- ドキュメントの入口は [docs/README.md](docs/README.md)、セットアップは [README.md](README.md#getting-started) を参照。
