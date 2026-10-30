# ドキュメント一覧 (Documentation Index)

Japan Disaster Alert のドキュメントハブです。読者のロール別に入口を用意しています。

## 役割別の入口 (Entry Points)

### 利用者 (Users)
アプリの起動・利用方法を知りたい方:
- [プロジェクト概要 / README](../README.md) — 機能・対応言語・セットアップ手順
- [免責事項](../README.md#disclaimer) — 本システムは公式災害情報の代替ではありません

### 運用者 (Operators)
ローカル実行・デプロイ・環境変数を扱う方:
- [デプロイ / 実行手順](ops/deployment.md) — 起動・停止・本番設定
- [環境変数一覧](../README.md#environment-variables) — `.env` の設定項目

### 保守者 (Maintainers)
コードを直す・確かめる方:
- [保守ガイド (MAINTAINING.md)](../MAINTAINING.md) — 逆引き（何を直すときにどこを触るか）・確認手順・壊れたときの見る所
- [引き継ぎメモ（日付付き）](dev/handoff/2026-10-25_remaining-local-tasks.md) — [2026-09-23 Cloud Run 公開](dev/handoff/2026-09-23_cloud-run-portfolio-release.md) / [2026-10-24 Codex P1 と dependabot ガード](dev/handoff/2026-10-24_codex-p1-and-dependabot-guard.md) / [2026-10-25 CI 品質ゲート](dev/handoff/2026-10-25_ci-quality-gates.md)。当時の記録で、現行の状態は [STATUS.md](../STATUS.md)

### 開発者 (Developers)
内部構造やコントリビュートを行う方:
- [アーキテクチャ](dev/architecture.md) — コンポーネント構成とデータフロー
- [要件と実装のギャップ分析](dev/requirements-gap-2026.md) — 訪日客ニーズに対する現状実装の差分と優先度
- [接点戦略](dev/touchpoints-2026.md) — 好みの入口（QR・サイネージ・埋め込み等）から使えるようにする方針と順番
- [用語集](glossary.md) — プロジェクト固有用語の定義
- [コントリビューションガイド](../CONTRIBUTING.md) — 開発フロー・コーディング規約
- [変更履歴 / CHANGELOG](../CHANGELOG.md) — リリースごとの変更点
- [仕様書 (spec.md)](../spec.md) / [計画・ロードマップ (plan.md)](../plan.md)

## 全ドキュメント (All Documents)

| ドキュメント | 種別 (Diátaxis) | 概要 |
|-------------|-----------------|------|
| [README.md](../README.md) | Tutorial / Reference | プロジェクト概要・セットアップ・API 一覧 |
| [docs/ops/deployment.md](ops/deployment.md) | How-to | 起動・停止・本番デプロイ手順 |
| [docs/dev/architecture.md](dev/architecture.md) | Explanation | アーキテクチャとデータフロー |
| [docs/glossary.md](glossary.md) | Reference | 用語集 |
| [CHANGELOG.md](../CHANGELOG.md) | Reference | 変更履歴 (Keep a Changelog) |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How-to | コントリビューション手順 |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Reference | 行動規範 |
| [SECURITY.md](../SECURITY.md) | Reference | 脆弱性報告ポリシー |
| [spec.md](../spec.md) | Reference | 仕様書 |
| [plan.md](../plan.md) | Explanation | フェーズ計画・決定事項ログ |
| [PROJECT_PLAN.md](../PROJECT_PLAN.md) | Explanation | 詳細プロジェクト計画 |
| [docs/research/JMA_API_UPDATE_2026.md](research/JMA_API_UPDATE_2026.md) | Reference | JMA API 更新調査 (2026) |
| [docs/research/inbound-disaster-needs-2026.md](research/inbound-disaster-needs-2026.md) | Reference | 訪日外国人の災害時ニーズ調査（公的調査の棚卸し） |
| [docs/research/b2b-pivot-demand-2026.md](research/b2b-pivot-demand-2026.md) | Reference | 訪日客に接する日本側の主体（宿泊施設・雇用主・自治体）の需要調査 |
| [docs/dev/requirements-gap-2026.md](dev/requirements-gap-2026.md) | Explanation | 要件と実装のギャップ分析・優先度提案 |
| [docs/dev/touchpoints-2026.md](dev/touchpoints-2026.md) | Explanation | 接点戦略（QR・サイネージ・埋め込み・公開フィードの順番と責任範囲） |
| [docs/strategy/differentiation-and-social-impact.md](strategy/differentiation-and-social-impact.md) | Explanation | 差別化戦略・社会貢献方針 |

## 質問・不具合報告 (Support)

質問や不具合は [GitHub Issues](https://github.com/TTMK7777/Japan-Disaster-Alert-v2/issues) からお願いします。
脆弱性の報告は [SECURITY.md](../SECURITY.md) の手順に従ってください。
