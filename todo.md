# Japan-Disaster-Alert-v2 -- タスク管理

## 進行中
(なし)

## 未着手
### 優先度: 高
- [ ] Phase 7: `/コードドクター` でフロントエンド・バックエンド一括レビュー
- [ ] `next.config.js` の rewrite 先を環境変数化 -- `.env.local` に `NEXT_PUBLIC_API_URL` 設定推奨
- [ ] CI/CD: GitHub Actions（Docker不要のテスト実行パイプライン）

### 優先度: 中
- [ ] Sentry: エラー監視統合（構造化ログは導入済み）
- [ ] AsyncClient共有化: jma/p2p/tsunami service のhttpxクライアント共有
- [ ] push_service バッチ化: asyncio.Semaphore(10) + gather
- [ ] EarthquakeList React.memo: リストアイテム最適化
- [ ] Pydantic V2 ConfigDict: class Config → SettingsConfigDict 移行
- [ ] Push通知の地域選択・震度しきい値 UI 拡張（現在は最小版ON/OFFのみ）

### 優先度: 低
- [ ] `scripts/generate-icons.js` の削除検討（アイコン生成後は不要）
- [ ] `backend/data/app.db` の .gitignore 確認
- [ ] Phase 3 未コミット分のコミット

## 完了
- [x] Phase 0: Vitest 66件 + Playwright E2E 28件
- [x] Phase 1: SSEリアルタイム配信 + 構造化ログ
- [x] Phase 2: DB移行（SQLAlchemy async）+ 地域セグメント通知
- [x] Phase 3: ダークモード完全対応（FOUT防止含む）
- [x] Phase 4: i18n全16言語完全対応（23キー x 16言語）
- [x] Phase 5: API信頼性強化（Gemini安定版、httpx共有化、ヘルスチェック）
- [x] Phase 6: マルチプラットフォーム対応（PWA、WCAG 2.1 AA、iOS Safari、SW v2）
- [x] 警報重複排除 + JMA定義注意事項（28種類 ja/en）
- [x] translator.py リファクタリング（1,306行 → 5モジュール分割）
- [x] volcano_service 並列化（asyncio.gather + Semaphore）
- [x] warning_service N+1修正（バッチ処理化）
- [x] shelter_service CSV対応（国土地理院CSV形式）
- [x] push_service 新設（VAPID, pywebpush）
- [x] テスト拡充: 8→31→38件（backend）、59→66件（frontend）
- [x] コードドクター修正: CRITICAL 4件 + HIGH 17件
- [x] セキュリティ: レート制限、リクエストサイズ制限、入力バリデーション
- [x] アクセシビリティ強化（ARIA属性、フォーカス管理、スクリーンリーダー対応）

## 保留
(なし)
