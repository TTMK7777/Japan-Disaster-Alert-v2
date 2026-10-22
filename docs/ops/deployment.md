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
| `NEXT_PUBLIC_SITE_URL` | フロント自身の公開 URL（SNS 共有の og:image を絶対 URL にする／宿の QR ポスター `/poster` の QR と印字 URL に使う）。ビルド時に焼き込むので `cloudbuild.yaml` の `_SITE_URL` で渡す（`gcloud builds submit ... --substitutions=_API_URL=...,_SITE_URL=https://...`。手順は §6 ③'）。未設定なら画像なしで共有し、ポスターは開いているページの origin で QR を作る | 任意 |

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

- 以下のコマンドはすべて**リポジトリルートで実行**する（`--source backend` や
  `--config frontend/cloudbuild.yaml` がルートからの相対パスのため）
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
  --min-instances 0 --max-instances 1 \
  --memory 512Mi --cpu 1 \
  --timeout 300 --concurrency 80 \
  --set-env-vars ENVIRONMENT=production,LOG_LEVEL=INFO
```

出力される `https://disaster-api-....run.app` を控えます。

#### ② frontend を①の URL 付きでビルドする

**`gcloud run deploy --source frontend` は使えません。** フロントは `NEXT_PUBLIC_API_URL` を
Dockerfile の `ARG` で受けますが、`--set-build-env-vars` は buildpacks 向けのフラグで
**Dockerfile の `ARG` には渡らない**ためです。build-arg を渡す `frontend/cloudbuild.yaml` を使います。

```bash
API_URL=$(gcloud run services describe disaster-api \
  --project japan-disaster-alert --region asia-northeast1 --format='value(status.url)')

gcloud builds submit frontend \
  --config frontend/cloudbuild.yaml \
  --project japan-disaster-alert \
  --substitutions _API_URL=${API_URL}
```

#### ③ frontend をビルド済みイメージからデプロイする

```bash
gcloud run deploy disaster-web \
  --image asia-northeast1-docker.pkg.dev/japan-disaster-alert/cloud-run-source-deploy/disaster-web:latest \
  --project japan-disaster-alert \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 1 \
  --memory 512Mi --cpu 1
```

> `--min-instances 0 --max-instances 1` は費用上限を構造で固定するため（オーナー裁定）。
> 誰も見ていない間は停止しているので、**しばらくアクセスが無かった後の最初の表示はコールドスタートで
> 数秒かかります**。常時起動による課金はありません。

> **API の URL を変えたときは②からやり直すこと。** 焼き込み済みのバンドルは
> 再デプロイだけでは更新されません。

#### ③' フロント自身の公開 URL（`_SITE_URL`）を焼き込む

`NEXT_PUBLIC_SITE_URL` は SNS 共有の og:image と、宿の QR ポスター（`/poster`）の QR・印字 URL に使います。
**初回は③が終わるまで frontend の URL が決まらない**ので、③の後に②を `_SITE_URL` 付きでやり直し、③を再実行します
（独自ドメインを付けた場合はその URL を渡す）。

```bash
WEB_URL=$(gcloud run services describe disaster-web \
  --project japan-disaster-alert --region asia-northeast1 --format='value(status.url)')

gcloud builds submit frontend \
  --config frontend/cloudbuild.yaml \
  --project japan-disaster-alert \
  --substitutions=_API_URL=${API_URL},_SITE_URL=${WEB_URL}
```

- 複数の置換は `,` 区切りで **1 つの `--substitutions`** に書く
- 未設定のままだと、スタッフがポスターを `localhost`・社内 LAN の IP で開いたとき、**客のスマホから開けない URL** が
  QR に入る。ポスター画面はその場合「この URL は他の端末から開けません」と警告する（印刷には出ない）

#### ④ backend の CORS に frontend の URL を通す

```bash
WEB_URL=$(gcloud run services describe disaster-web \
  --project japan-disaster-alert --region asia-northeast1 --format='value(status.url)')

gcloud run services update disaster-api \
  --project japan-disaster-alert --region asia-northeast1 \
  --update-env-vars CORS_ORIGINS=${WEB_URL}
```

**④を飛ばすとブラウザのコンソールに CORS エラーだけが出て、画面はデータ0件のまま**になります
（`config.py` の既定値は localhost のみ）。

### コスト設計

| 設定 | 値 | 理由 |
|---|---|---|
| `disaster-api` min-instances | **0** | 誰も見ていない間は課金ゼロ。SSE 接続がある間だけ起きる |
| `disaster-api` max-instances | **1** | 費用上限（2026-09-23 の裁定）。SSE は1接続でインスタンスを占有し続けるため上限必須。アクセス集中は §7 のスナップショットとキャッシュで受ける |
| `disaster-api` timeout | **300秒** | SSE を5分で切ってクライアントに再接続させる。無制限に張らせない |
| `disaster-web` min-instances | **0** | 費用上限を構造で固定する（オーナー裁定）。誰も見ていない間は課金ゼロ。代わりにアクセスが途絶えた後の初回表示はコールドスタートで数秒かかる |
| `disaster-web` max-instances | **1** | 費用上限（オーナー裁定）。アクセス集中は §7 のスナップショットとキャッシュで受ける |

Cloud Run には月間無料枠（180,000 vCPU秒 / 360,000 GiB秒 / 200万リクエスト）があります。
**注意すべきは SSE**で、タブを開きっぱなしにされると接続中ずっと vCPU 秒を消費します。
`--timeout 300` と `max-instances 1` がその上限装置です。

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

## 7. 表示用スナップショット（埋め込み・サイネージ向けの静的配信）

災害時は埋め込み・サイネージ・多数の訪日客からアクセスが集中します。表示に使うデータを
1 つの JSON（スナップショット）にまとめ、短時間キャッシュできる形で配れるようにしてあります。
**このリポジトリにあるのはコード側だけ**で、クラウド資源（Scheduler・Job・公開 bucket）は作っていません。

### いまあるもの

| もの | 場所 | 内容 |
|---|---|---|
| 生成関数 | `backend/app/services/snapshot_service.py` | 地震（直近 10 件）・発表中の津波警報/注意報・発表中の噴火警報を、dataset ごとの成否と取得成功時刻つきでまとめる |
| API | `GET /api/v1/snapshot` | 最後の版をメモリに持ち、60 秒より古ければ作り直す（同時リクエストは 1 本の生成を待つ）。`Cache-Control: public, max-age=<60 − 生成からの経過秒>, stale-while-revalidate=30` と `ETag`（`If-None-Match` 一致で 304）。利用者が見る最悪の古さは約 2 分レート制限は他の API と同じ `RATE_LIMIT_GENERAL` |
| CLI | `scripts/build_snapshot.py --out <path>` | 同じ生成関数でファイルに書き出す。終了コード 0 = 全部 ok / 2 = 書き出したが stale・error を含む / 1 = 書き出せなかった。`--out` に前回の出力があれば前回値として読む |
| スキーマ | `docs/dev/snapshot-schema.json` | pydantic モデル（`backend/app/snapshot_models.py`）から生成。更新は `--write-schema docs/dev/snapshot-schema.json`。モデルとの不一致はテストが止める |

dataset の `status` は次の 3 つです。**「取得失敗」と「0 件」を区別する**ためのもので、
失敗を空配列で表すことはありません。

- `ok`: 今回取得に成功。`items: []` は「取得時点で対象なし」を確認済みという意味
- `stale`: 今回は失敗。`items` と `fetched_at` は**前回成功時**のまま（古さは `fetched_at` から計算する）。
  前回成功から **15 分を過ぎたら `error` に落とす**（表示側が `fetched_at` を見なくても、古い「津波なし」が出続けないように）
- `error`: 今回失敗し、15 分以内の前回成功も無い。`items` と `fetched_at` は `null`
- 上流が 200 を返しても、読める報・レコードが 1 件も無い（キー改名など形の変化）ときは失敗として扱う。
  区域が全部 解除・予報 で発表中が 0 件になるのは正当な 0 件（`ok` と `[]`）

言語別の表示文は入れていません（事実・コード・気象庁の日本語名だけを持ち、文言はフロントの辞書で描く）。
`source.official` は常に `false` で、気象庁の発表を中継したものであり公式発表ではないことを示します。

### 入れていないもの

- **気象警報・注意報（府県予報区 58 件）**: 全国を毎分 1 巡すると 58 回 × 毎分 = 月約 250 万回、
  気象庁へリクエストすることになります。上流への負荷と利用条件の確認、条件付き取得や
  取得周期を分ける案を比べてから決める項目（設計メモで判断待ち）のため、今回は入れていません。
  入れるときは 58 区の一部だけ失敗した状態（partial）を表せるようにスキーマの小版を上げます
- **CAP（Common Alerting Protocol）形式**: 今後。解除・訂正を事象ごとに永続的に追跡する仕組みが
  前提のため、JSON を先に出しています

### オーナー作業: Scheduler → Cloud Run Job → GCS（未実施）

ここから先は**オーナーの判断と操作**です（新しいクラウド資源・リージョン・予算を伴うため）。
以下は手順の案で、このリポジトリの作業では gcloud を実行していません。

1. **配信用の bucket を決める。** 公開専用の bucket と、非公開の状態保存用を分ける。
   公開してよいのはスナップショットの JSON だけ（リポジトリや他のデータを置かない）
2. **Job 用のイメージを用意する。** `scripts/build_snapshot.py` は `backend/` の外にあるため、
   現在の backend イメージ（`backend/Dockerfile` は `app/` と `data/` だけを COPY）には入っていません。
   Job 化するときは CLI をイメージに含める変更が要ります
3. **GCS への書き込み方を決める。** CLI はいまローカルファイルにだけ書き出します。
   Cloud Storage FUSE のボリュームを `--out` の書き出し先にするか、CLI に GCS 書き込みを足すかを選ぶ
   （前者で一時ファイル → 置き換えが原子的になるかは未確認）
4. **Cloud Run Job を作る**（例: `--tasks 1 --max-retries 0`。終了コード 2 を失敗として監視するかを決める）
5. **Cloud Scheduler から毎分起動する。** 重複起動・再試行で新旧の実行が前後しうるので、
   古い実行が新しい版を上書きしない仕組み（世代条件付きの書き込み等）を Job 化と同時に入れる
6. **公開オブジェクトのメタデータ**を `Content-Type: application/json; charset=utf-8`、
   `Cache-Control: public, max-age=30` 程度にし、CORS は GET/HEAD・認証なしに限る
7. 予算アラート（上の「予算アラートを必ず設定する」）に、この Job と bucket の費用も含める

#### 費用の目安（参照試算・実測ではない）

出典: 2026-10-22 に作成した設計メモ（B5 静的フィード、配信方式と概算）の試算。単価は
[Cloud Run pricing](https://cloud.google.com/run/pricing)・[Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing)・
[Cloud Storage pricing](https://cloud.google.com/storage/pricing) の **us-central1（Iowa）表示**で、
東京リージョンの見積ではありません。USD・税別・30 日、無料枠適用前。仮定は毎分 43,200 回/月・
1 vCPU / 512 MiB・JSON 200 KiB（16 言語同梱を仮定した値。表示文を入れない今回の JSON はこれより小さい）。

| 項目 | 目安/月 | 前提 |
|---|---|---|
| Scheduler → **Run Job** の生成 | **約 $49.25**（＋Scheduler 最大約 $0.10） | Job は 1 回ごとに最低 60 秒課金されるため、処理が 10 秒で終わっても 60 秒 × 43,200 回 |
| 参考: Scheduler → 専用 Run service（認証付き・request-based） | 約 $10.93 | 1 回 10 秒の仮定（未実測）。45 秒かかれば約 $49.10 |
| GCS 書き込み | 約 $0.43 | 版付き JSON と最新版の 2 書き込み/回 |
| 閲覧 100 万回（各 200 KiB） | 約 $23.29 | アジア宛 Internet 転送 $0.12/GiB ＋ 読み取り操作。100 万人ではなく 100 万回の取得 |
| サイネージ 100 台が毎分 latest（1 KiB）を読む | 約 $2.22 | 432 万 GET/月 |

いずれも既存の通常 API（`disaster-api`）とは**別の計算資源**を追加します。
「プロジェクト全体で 1 インスタンスだけ」という制約で運用している場合は、その扱いもあわせて判断してください。
