# Japan-Disaster-Alert-v2 -- 失敗と教訓

## 失敗記録

### translator.py God Object (1,306行)
- **問題**: 翻訳サービスが単一ファイルに肥大化
- **原因**: 機能追加を繰り返した結果
- **対策**: ファサードパターンで5モジュールに分割
- **教訓**: 早期にモジュール分割を検討する。500行を超えたら分割候補

### Push endpoint GET→POST変更
- **問題**: GETメソッドでプッシュ通知を購読しており、URLパラメータに情報が露出
- **対策**: POST変更
- **教訓**: 機密情報を扱うエンドポイントは常にPOSTを使用する

### alert_type URL injection
- **問題**: alert_typeパラメータに任意の値を注入可能
- **対策**: VALID_ALERT_TYPES whitelist
- **教訓**: 全てのユーザー入力をバリデーションする

### ハイドレーションミスマッチ
- **問題**: サーバーとクライアントで初期値が異なりReactのハイドレーションエラー
- **対策**: useState('ja') + useEffect復元
- **教訓**: SSR/CSR間の初期状態は一致させる。localStorage等クライアント専用のデータはuseEffectで復元

### ダークモードFOUT
- **問題**: ページ読み込み時にテーマが一瞬ちらつく
- **対策**: `<head>` 内のblocking inline scriptでテーマを先行適用
- **教訓**: テーマ適用はレンダリング前に完了させる

### EventManager race condition
- **問題**: SSEクライアント管理で競合状態
- **対策**: single-lock alive-list パターン
- **教訓**: 非同期処理での共有リソースアクセスには明示的なロックを使用する

### 警報重複（31件→1件）
- **問題**: 同一警報コードが地域ごとに重複表示
- **対策**: 地域別にグループ化→1件に統合
- **教訓**: 外部APIデータの重複は集約ロジックで処理する

### N+1 APIパターン
- **問題**: 47都道府県を順次リクエスト（warning_service）
- **対策**: `asyncio.gather()` + `Semaphore(10)` で並列化
- **教訓**: ループ内のAPI呼び出しは必ず並列化を検討する

## 不採用記録

### LINE Messaging API
- **理由**: MVP段階では Web Push で十分。トレーサビリティ上は「未実装」
- **将来**: ユーザー基盤拡大後に検討

### FCM (Firebase Cloud Messaging)
- **理由**: VAPID方式でFCM不要のWeb Push実装が可能
- **代替**: pywebpush + VAPID

## フィードバック
- 取締役会レビュー: CONDITIONAL (COO: YELLOW, CTO: YELLOW) → 修正後APPROVE相当
- CTO指摘: God Object、N+1、ハードコード → 全て対応済み
- トレーサビリティ: 充足率71%（LINE未実装が主因）
