# Japan-Disaster-Alert-v2 -- 計画・ロードマップ

## フェーズ管理

### Phase 0: フロントエンドテスト基盤 -- 完了
- Vitest + React Testing Library: 59→66ユニットテスト
- Playwright E2E: 28テスト

### Phase 1: SSEリアルタイム配信 + 構造化ログ -- 完了
- EventManager: 10秒ポーリング、ID差分検出、ハートビート30秒
- SSEエンドポイント `/api/v1/events/stream`（MAX_SSE_CLIENTS=500）
- useEventStreamフック: exponential backoff再接続 + ポーリングFB
- ConnectionStatusコンポーネント
- python-json-logger: 本番JSON/開発プレーンテキスト自動切替

### Phase 2: DB移行 + 地域セグメント通知 -- 完了
- SQLAlchemy async + aiosqlite
- 翻訳キャッシュDB化（L1メモリ + L2 DB）
- Push通知DB化（JSON → SQLite）
- 地域セグメント（47都道府県コード、震度しきい値）

### Phase 3: ダークモード完全対応 -- 完了
- useThemeフック（light/dark/system、localStorage永続化）
- ThemeToggle（サイクルボタン）
- FOUT防止（blocking inline script）

### Phase 4: i18n全16言語完全対応 -- 完了
- `translations.ts`: `getTranslation()`, `getLocale()`, `LOCALE_MAP` + 23キー x 16言語
- 11コンポーネントのハードコード英語フォールバック修正

### Phase 5: API信頼性強化 -- 完了
- Gemini `gemini-2.0-flash`（安定版）
- httpxクライアント共有化
- `/api/v1/health` 詳細ヘルスチェック

### Phase 6: マルチプラットフォーム対応 -- 完了
- PWAアイコン11枚 + favicon + manifest
- WCAG 2.1 AA対応
- レスポンシブマップ、safe-area-inset
- iOS Safari対応
- SW v2（プリキャッシュ拡張、navigation preload）
- Push通知UI

### Phase 7: コードドクター -- 未着手
- フロントエンド・バックエンド一括レビュー

## 決定事項ログ
| 日付 | 決定 | 理由 |
|------|------|------|
| 2026-02-11 | slowapiでレート制限追加 | 公開データソース保護 |
| 2026-02-11 | ContentSizeLimitMiddleware(1MB) | セキュリティ強化 |
| 2026-02-23 | translator.py を5モジュール分割 | 1,306行 God Object の解消 |
| 2026-02-23 | pywebpushでWeb Push実装 | FCM不要のVAPID方式 |
| 2026-03-09 | SSE MAX_SSE_CLIENTS=500 | DoS防御 |
| 2026-03-27 | 警報重複排除（31件→1件統合） | 同一警報の地域別グループ化 |
