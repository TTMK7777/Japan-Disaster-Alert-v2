# Japan-Disaster-Alert-v2 -- 技術判断・知見

## アーキテクチャ

### バックエンド
- FastAPI + SQLAlchemy async + aiosqlite
- translator.py はファサードパターンで5モジュールに分割:
  - translator.py (ファサード)
  - ai_provider.py (Gemini/Claude API)
  - safety_guide.py (AI安全ガイド生成)
  - translation_cache.py (L1メモリ + L2 DB、SHA-256キー)
  - translation_templates.py (静的多言語テンプレート)
- EventManager: バックグラウンド10秒ポーリング、ID差分検出、ハートビート30秒
- lifespan shutdown: `translator.close()` でHTTPクライアント・キャッシュを適切にクローズ

### フロントエンド
- Next.js 15 App Router + React 19
- useEventStreamフック: EventSource + exponential backoff再接続（最大5回）+ 30秒ポーリングFB
- useThemeフック: light/dark/system、localStorage永続化、system preference listener
- FOUT防止: `<head>` 内のblocking inline script
- 翻訳: フラットキー→translations.ts、ネスト構造→コンポーネント内残置

### セキュリティ
- レート制限（slowapi）: 一般60/翻訳20/安全ガイド10 per min
- ContentSizeLimitMiddleware(1MB)
- Push endpoint: GET→POST変更（URLパラメータ露出防止）
- alert_type: VALID_ALERT_TYPES whitelist（URL injection防止）
- sanitizeLang() バリデーション

## 外部API

### P2P Earthquake Network
- REST API
- 10秒間隔でポーリング
- `backend/app/services/p2p_service.py`

### JMA (気象庁)
- REST API
- 都道府県コードでクエリ
- `backend/app/services/jma_service.py`

### AI翻訳
- Gemini `gemini-2.0-flash`（安定版）、Anthropic `claude-haiku-4-5`
- httpx.AsyncClient再利用（接続プーリング）
- JSONパース堅牢化: 3段階ヘルパー（直接→コードブロック→ブレース抽出）

## テスト
- Backend: `cd backend && HOME=/tmp pytest tests/ -v` (38件)
- Frontend: `cd frontend && npx vitest run` (66件)
- E2E: `cd frontend && npx playwright test` (28件)

## WARNING_GUIDANCE
- 28種類の気象警報注意事項（ja/en）をコード内に定義
- JMA公式定義に基づく

## FAQ

### テスト実行時に .env.local が干渉する
`HOME=/tmp pytest tests/ -v` で回避する。

### SSE接続が503になる
MAX_SSE_CLIENTS=500 に達した。クライアント数を確認する。
