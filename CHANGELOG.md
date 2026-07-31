# Changelog

このプロジェクトの主な変更点を記録します。

フォーマットは [Keep a Changelog 1.1.0](https://keepachangelog.com/ja/1.1.0/) に準拠し、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]

### Added
- **表示言語のブラウザ設定からの自動判定**: 初回訪問時に `navigator.languages` から言語を推定して表示する
  （明示選択が保存されていればそれを優先。該当言語なしは英語。`easy_ja` は自動選択しない）。
  従来は初回訪問の外国人にも日本語が表示されていた
- pip-audit 脆弱性ゲートのワークフローを追加（#50）
  ※ 現状は呼び出し先の再利用ワークフローを解決できず未稼働。修正までゲートとして機能していない

### Security
- 依存関係の脆弱性修正: postcss 8.5.23（GHSA-r28c-9q8g-f849）、sharp 0.35.3 override（GHSA-f88m-g3jw-g9cj）、
  @babel/core 7.29.6 override（GHSA-4x5r-pxfx-6jf8）、pytest 9.0.3 + pytest-asyncio 1.4.0（GHSA-6w46-j5rx-g56g）、
  next / undici / esbuild の Dependabot 更新（#44-#48, #52-#55）

### Added
- **オフラインページを16言語の行動ガイドに拡張。** 従来は「オフラインです」+ 緊急連絡先の
  5言語だったものを、**3ステップの行動指示**（身の安全確保 → 火を消し高い場所へ → 公式指示に従う）
  を含む16言語に拡張し、ブラウザ言語から自動選択するようにした。
  外部リソースを一切読まず、Service Worker がプリキャッシュするため通信なしで読める
- **気象警報の名称と説明文を16言語化。** 従来は6言語（ja / en / zh / ko / vi / easy_ja）のみで、
  zh-TW・th・id・ms・tl・ne・fr・de・it・es のユーザーは「何の警報か」を英語で読んでいた。
  「災害種別 × 警報レベル」の合成方式に変更し、既存6言語の文面は1文字も変えていない
  （移行前の全29コード分の文面をテストに凍結して突合）
- **気象警報の行動ガイダンスを16言語化。** 従来は ja / en の2言語しかなく、他の14言語は
  実行時に英語へフォールバックしていた。災害種別を13グループにまとめてグループ単位で
  16言語の行動指示を用意し、特別警報には「命に関わる危険」の接頭語を付ける。
  ja / en の警報コード別文面は従来どおり優先される

### Security
- **設定読み込みから秘密情報が漏れる経路を塞いだ。** `Settings` がユーザーのホーム配下の
  env ファイル（`~/.env.local`）まで読んでいたため、他プロジェクトの認証情報が混入し、
  pydantic-settings の `extra` 既定値（`forbid`）と噛み合って **`ValidationError` の
  メッセージに値が平文で載る**状態だった。読み込み対象をリポジトリ内に限定し、
  `extra="ignore"` を設定した。副次効果としてローカルの pytest がホーム退避なしで通る

### Fixed
- **AI が使えないときの安全ガイドが日本語のみだった問題を修正。** APIキー未設定・通信断・
  レート制限・停電時のフォールバックを **16言語**に対応させた（未対応言語は日本語ではなく英語へ）。
  レスポンスに `fallback` フラグを追加し、静的ガイドか AI 生成かをクライアントが判別できるようにした
- SSR 既定値の `ja` を「利用者の明示選択」として localStorage に保存してしまい、
  次回以降もブラウザ言語の推定が効かなくなる問題を修正

### Changed
- ドキュメント棚卸し: 公開リリース向けの索引・構成整備、ローカルパスの汎化、アーカイブ文書へのバナー付与（#41, #43, #49, #51）
- テスト件数の実測反映: pytest バックエンド 86 件（CI 実測、2026-07-27 時点）
- 訪日客の災害時ニーズ調査と、要件↔実装ギャップ分析を `docs/` に追加

> 未着手: Phase 7「コードドクター」（フロントエンド・バックエンド一括レビュー）

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
