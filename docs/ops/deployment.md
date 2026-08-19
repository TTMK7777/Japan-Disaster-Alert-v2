# デプロイ / 実行手順 (Deployment & Run)

> **注意**: このランブックは、本番運用に頼る前に一度通しで手動実行し、各コマンドが
> 自分の環境で動作することを確認してください。値（ポート・パス・キー）は環境により異なります。

本書は2通りの構成を扱います。

1. **ローカル / 単一サーバ構成**（第1〜5節）— バックエンドとフロントエンドを個別プロセスで起動する
2. **Cloud Run への公開デプロイ**（第6節）— コンテナ2サービス構成

コンテナ定義は `backend/Dockerfile` と `frontend/Dockerfile` にあります。
GitHub Actions は `ci.yml`（テスト）、`dependabot-automerge.yml`、`pip-audit.yml` のみで、
**デプロイの自動化は含みません**（Cloud Run へは手動デプロイ）。

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

---

## 6. Cloud Run への公開デプロイ (Production on Cloud Run)

### 構成

```
[利用者] --> disaster-web  (Cloud Run / Next.js standalone)
                  |
                  +--( ブラウザから直接 )--> disaster-api (Cloud Run / FastAPI)
```

フロントとAPIは**別オリジン**です。ブラウザが API を直接叩くため、API 側で CORS 許可が要ります。
Next.js の `rewrites` でプロキシしない理由は、**SSE 接続の間フロント側インスタンスが占有され、
同時接続数と課金を二重に食う**ためです。

### 前提

- GCP プロジェクト（本番: `japan-disaster-alert`）に**請求先アカウントが紐付いていること**
- 有効化済み API: `run.googleapis.com` / `cloudbuild.googleapis.com` / `artifactregistry.googleapis.com`
- リージョンは `asia-northeast1`（東京）

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project=japan-disaster-alert
```

### 順序（この順でないと通らない）

`NEXT_PUBLIC_*` は**ビルド時にクライアントバンドルへ焼き込まれる**ため、
API の URL が確定してからでないとフロントをビルドできません。

#### ① backend をデプロイして URL を確定させる

```bash
gcloud run deploy disaster-api \
  --source backend \
  --project japan-disaster-alert \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 3 \
  --memory 512Mi --cpu 1 \
  --timeout 300 --concurrency 80 \
  --set-env-vars ENVIRONMENT=production,LOG_LEVEL=INFO
```

出力される `https://disaster-api-....run.app` を控えます。

#### ② frontend を①の URL 付きでビルド＆デプロイ

```bash
API_URL=$(gcloud run services describe disaster-api \
  --project japan-disaster-alert --region asia-northeast1 --format='value(status.url)')

gcloud run deploy disaster-web \
  --source frontend \
  --project japan-disaster-alert \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 3 \
  --memory 512Mi --cpu 1 \
  --set-build-env-vars NEXT_PUBLIC_API_URL=${API_URL}
```

> `--min-instances 1` はコールドスタート回避のため。災害時に初回表示が数秒遅れるのを避ける意図で、
> ここだけ常時課金を受け入れています。コストを切り詰めるなら `0` に下げられます。

#### ③ backend の CORS に frontend の URL を通す

```bash
WEB_URL=$(gcloud run services describe disaster-web \
  --project japan-disaster-alert --region asia-northeast1 --format='value(status.url)')

gcloud run services update disaster-api \
  --project japan-disaster-alert --region asia-northeast1 \
  --update-env-vars CORS_ORIGINS=${WEB_URL}
```

**③を飛ばすとブラウザのコンソールに CORS エラーだけが出て、画面はデータ0件のまま**になります
（`config.py` の既定値は localhost のみ）。

### コスト設計

| 設定 | 値 | 理由 |
|---|---|---|
| `disaster-api` min-instances | **0** | 誰も見ていない間は課金ゼロ。SSE 接続がある間だけ起きる |
| `disaster-api` max-instances | **3** | 暴走課金の上限。SSE は1接続でインスタンスを占有し続けるため上限必須 |
| `disaster-api` timeout | **300秒** | SSE を5分で切ってクライアントに再接続させる。無制限に張らせない |
| `disaster-web` min-instances | **1** | コールドスタート回避（常時課金が発生する唯一の箇所） |

Cloud Run には月間無料枠（180,000 vCPU秒 / 360,000 GiB秒 / 200万リクエスト）があります。
**注意すべきは SSE**で、タブを開きっぱなしにされると接続中ずっと vCPU 秒を消費します。
`--timeout 300` と `max-instances 3` がその上限装置です。

#### 予算アラートを必ず設定する

`max-instances` は同時実行数の上限であって**支出の上限ではありません**。
Cloud Run に支出の自動停止機能はないため、請求額の監視は予算アラートで行います。

[請求 → 予算とアラート](https://console.cloud.google.com/billing/budgets) から、
プロジェクト `japan-disaster-alert` に対して月額予算（例: 3,000円）と
50% / 90% / 100% の通知しきい値を設定してください。
CLI では `gcloud billing budgets` が alpha/beta 扱いのため、コンソールでの操作になります。

### 既知の制約（この構成で「動かないもの」）

1. **Push 通知の購読はインスタンス再起動で消える。** SQLite（`data/app.db`）がコンテナ内にあるため、
   スケールイン・再デプロイで購読データが失われます。常時運用するには GCS / Firestore などへの
   移行が必要です。地震・警報・避難所・交通・16言語ガイドは外部 API の読み取りのみで動くため影響ありません。
2. **バックグラウンド監視は min-instances=0 の間だけ止まる。** `lifespan` で起動する
   `event_manager` はインスタンスが生きている間のみ動きます。誰も接続していない時間帯の
   イベント検出は行われません。
3. **AI 経路の自由文翻訳は無効。** `GEMINI_API_KEY` を設定していないため、
   静的辞書（16言語）でカバーされる範囲のみ動作します。

### スモークテスト

```bash
API_URL=$(gcloud run services describe disaster-api --project japan-disaster-alert \
  --region asia-northeast1 --format='value(status.url)')

curl -sS "${API_URL}/api/v1/health" | head -20
curl -sS "${API_URL}/api/v1/earthquakes?lang=en&limit=3" | head -5
```

フロントは実ブラウザで開き、**地震一覧にデータが出ること**と
**接続インジケータが緑（SSE 接続）になること**を目視で確認します。
型チェックが通っただけでは検証になりません。
