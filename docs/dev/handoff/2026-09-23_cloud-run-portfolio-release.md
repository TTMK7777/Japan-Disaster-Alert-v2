# 引き継ぎ: 公開形態の裁定（Cloud Run → 任意で TWA）

## 2026-09-23

**ゴール**: 無料ポートフォリオとして公開 URL を持つ（B2B 本格展開はしない）。「スマホアプリ」の看板は TWA で後付け。

**完了したこと**
- 公開形態を裁定。フロントは PWA 済だが 11 ファイルが backend の 7 エンドポイント（events/SSE・tsunami・shelters・volcanoes・transit-links・push）に依存し、秘密値も backend 側 → APK ラッパー単体ではサーバ要件は消えない。クライアント完結型（backend 約 20 モジュールの TS 移植）は目的に対し過剰として不採用
- 現況確認: GCP プロジェクト ACTIVE、Cloud Run サービス 0 件（公開 URL 未存在）。免責文は既存（16 言語網羅は未確認）

**残タスク（先頭が次の一手）**
1. pre-flight: 直近の依存更新（next/sharp）後に backend/frontend のビルド・テストが緑か確認
2. `gcloud run deploy disaster-api`（オーナー実行。`--min-instances 0 --max-instances 1` で費用上限を固定。手順は `docs/ops/deployment.md` 第 6 節）
3. frontend を Cloud Build（`_API_URL=<api URL>`）→ `disaster-web` deploy → `CORS_ORIGINS` 更新
4. 疎通・16 言語スモーク → README に live URL/スクショ → STATUS.md 更新
5. 任意: TWA（Bubblewrap）+ Play Store 掲載
- 据え置き: ne/th ネイティブ確認、JMA API 障害時挙動の実測、予算アラート（コンソール手動）

**作業ブランチ・PR・Issue**: main（open Issue/PR 0 件）。本ファイルは docs PR。

**決めたこと・見送ったこと**
- 採用: Cloud Run min0/max1 → URL → 任意で TWA。理由: 既存資産（Dockerfile・Cloud Build 実績・手順書）で残りはコマンド 4 本、旅行者・B2B の接点は URL/QR で APK sideload ではない
- 見送り: クライアント完結 APK（AI 翻訳フォールバックとサーバ push を失い、書き換え規模が大きい）
