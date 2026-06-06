# デプロイ / 実行手順 (Deployment & Run)

> **注意**: このランブックは、本番運用に頼る前に一度通しで手動実行し、各コマンドが
> 自分の環境で動作することを確認してください。値（ポート・パス・キー）は環境により異なります。

本プロジェクトには Dockerfile や CI/CD デプロイパイプラインは含まれていません
（GitHub Actions は `ci.yml`（テスト）と `dependabot-automerge.yml`（依存関係自動マージ）を含む）。バックエンドとフロントエンドを
個別のプロセスとして起動するローカル / 単一サーバ構成を前提とします。

## 前提条件 (Prerequisites)

- Python 3.11 以上（CI は 3.12 で検証）
- Node.js 18 以上（CI は 20 で検証）
- npm

## 1. バックエンド (Backend)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # .env を編集（環境変数は下記参照）
python run.py
```

- 起動先: <http://localhost:8000>
- API ドキュメント: <http://localhost:8000/docs>
- `run.py` は開発向け設定です（`reload=True`、`host=0.0.0.0`、`port=8000`）。

### 本番起動 (Production)

本番では `reload` を無効化し、Uvicorn を直接起動します。

```bash
cd backend
ENVIRONMENT=production uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`ENVIRONMENT=production` の場合、ログは構造化 JSON（`app/utils/logger.py`）に切り替わります。

## 2. フロントエンド (Frontend)

```bash
cd frontend
npm install
npm run dev        # 開発: http://localhost:3001
```

### 本番ビルド (Production Build)

```bash
cd frontend
npm ci
npm run build
npm run start      # next start
```

`NEXT_PUBLIC_API_URL` をバックエンドの公開 URL に設定してください。

## 3. 両サービスの同時起動 (Both at Once)

開発時はヘルパースクリプトで両方を起動できます。

```bash
chmod +x scripts/start_dev.sh
./scripts/start_dev.sh
```

Windows では同梱の `start.bat` / `start_with_browser.bat`（WSL 経由）、停止は `stop.bat` が利用できます。

## 4. 環境変数 (Environment Variables)

`backend/.env.example` をコピーして `backend/.env` を作成し、値を設定します。
主な項目（全項目は [README の Environment Variables](../../README.md#environment-variables) を参照）:

| 変数 | 説明 | 必須 |
|------|------|------|
| `ENVIRONMENT` | `development` / `production` | 任意 |
| `LOG_LEVEL` | ログレベル | 任意 |
| `AI_PROVIDER` | `auto` / `gemini` / `claude` | 任意 |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | AI 翻訳キー（未設定でも静的翻訳で動作） | 任意 |
| `CORS_ORIGINS` | 許可する CORS オリジン | 任意 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CLAIMS_EMAIL` | Web Push 用 VAPID | 任意 |
| `DATABASE_URL` | DB URL（既定: `data/app.db` の SQLite） | 任意 |
| `HOST` / `PORT` | バインドアドレス・ポート | 任意 |
| `NEXT_PUBLIC_API_URL` | フロントエンドが参照するバックエンド URL | 任意 |

> シークレット（API キー・VAPID 秘密鍵）は `.env` に保存し、リポジトリへコミットしないでください。`.env` は `.gitignore` 済みです。

## 5. デプロイ後の確認 (Smoke Test)

起動後、ヘルスチェックで疎通を確認します。

```bash
curl http://localhost:8000/                 # 簡易ヘルスチェック
curl http://localhost:8000/api/v1/health    # 詳細（P2P / JMA / DB / AI）
```

詳細ヘルスチェックで各依存先（P2P、JMA、DB、AI）の状態を確認できます。
