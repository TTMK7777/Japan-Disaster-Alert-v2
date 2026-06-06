# Changelog

このプロジェクトの主な変更点を記録します。

フォーマットは [Keep a Changelog 1.1.0](https://keepachangelog.com/ja/1.1.0/) に準拠し、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]

### Added
- Phase 7「コードドクター」: フロントエンド・バックエンド一括レビュー（未着手）

## [1.0.0] - 2026-06-06

在日外国人・訪日観光客向けに、気象庁（JMA）と P2P 地震情報ネットワークのデータを
16 言語でリアルタイム配信する防災 Web アプリケーションの初期版。

### Added
- リアルタイム地震データ: P2P Earthquake Network のライブフィードと震度マップ
- SSE リアルタイムストリーミング: `/api/v1/events/stream`（10 秒ポーリング差分検出、30 秒ハートビート、`MAX_SSE_CLIENTS=500`、ポーリングフォールバック付き）
- JMA 気象警報: 都道府県レベルの気象警報と注意事項、警報重複排除（同一警報コードの地域別グループ化）
- 16 言語対応のハイブリッド翻訳エンジン: 静的ロケーション辞書 → AI 翻訳（Gemini / Claude、任意）→ DB バックのキャッシュ（L1 メモリ + L2 DB）
- 地域セグメント通知: 47 都道府県コードと震度しきい値による Web Push（VAPID）
- 避難所検索: 現在地ベースの避難所検索（国土地理院 CSV 対応）
- ダークモード: Light / Dark / System テーマ、localStorage 永続化、FOUT 防止
- PWA: オフライン対応、インストール可能、Service Worker v2、PWA アイコン一式
- WCAG 2.1 AA 対応: ズーム有効化、スキップリンク、44px タッチターゲット、safe-area 対応
- 津波・火山警報、AI 安全ガイド、対応言語一覧などの API エンドポイント群
- エンドポイント別レート制限（slowapi）とリクエストサイズ制限（1MB）
- 包括的テスト: pytest（バックエンド 56 件）、Vitest（ユニット 66 件）、Playwright（E2E 28 件）
- GitHub Actions CI（pytest + Vitest）、Dependabot 自動マージ

### Changed
- `translator.py`（1,306 行の God Object）を 5 モジュールに分割
- Push 通知の永続化を JSON から SQLite（SQLAlchemy async + aiosqlite）へ移行
- Gemini モデルを安定版 `gemini-2.0-flash` に固定し、httpx クライアントを共有化

### Fixed
- セキュリティ硬化: nonce ベース CSP、SSE レート制限、`lang` / `location` 入力検証、push 送信先ドメイン制限、IDOR の根本修正（Management Token 方式）
- Gemini API キーを URL クエリから `x-goog-api-key` ヘッダへ移行
- GitHub Actions を SHA ピン留め（サプライチェーン硬化）、依存関係の脆弱性修正

> なお、このチェンジログ以前の開発履歴があります。詳細は `git log` を参照してください。

[Unreleased]: https://github.com/TTMK7777/Japan-Disaster-Alert-v2/compare/main...HEAD
[1.0.0]: https://github.com/TTMK7777/Japan-Disaster-Alert-v2
