# 保守ガイド

このリポジトリ（Japan Disaster Alert）を、AI を使わずに保守するための案内です。何をするアプリかは [README.md](README.md)、文書の一覧は [docs/README.md](docs/README.md) にあります。

> このアプリは公式の災害情報の代わりではありません（[README.md](README.md#disclaimer)）。警報・避難・緊急連絡先に関わる表示を変えるときは、必ず気象庁など公式の情報源と照らして確認してください。

## 2 種類のファイル

このリポジトリには「普通のコード」のほかに、AI（Claude Code や Codex）に読ませる指示書があります。どちらもテキストエディタで直せます。AI を使わない場合、指示書は無視して構いません。

| 種類 | 例 | 何か | 直すときの注意 |
|---|---|---|---|
| 普通のコード | `backend/app/main.py`、`frontend/src/middleware.ts` | 人が書いたプログラム。AI なしで動く | 直したら下の「直したあとの確認」を回す |
| AI への指示書 | [AGENTS.md](AGENTS.md)、[CLAUDE.md](CLAUDE.md) | AI に渡す作業ルール。ただし CLAUDE.md は「過去に踏んだ落とし穴」の記録としても有用で、人が読んでも役に立つ | 本文は AI が読んで従うので、言い回しを変えると AI の動きが変わる。人間向けの案内はこの文書や docs/ に書く |
| 設定 | `backend/pyproject.toml`、`backend/requirements.txt`、`frontend/package.json`、`.github/workflows/ci.yml` | ツール・依存・CI の動き方 | 依存を変えたら lockfile（`frontend/package-lock.json` と、リポジトリ直下の `package-lock.json`）も一緒に直る。CI は GitHub 上で動く |
| 生成物 | `backend/app/services/area_names.py` | スクリプトが作ったデータ | 手で直さず、元のスクリプト（`scripts/generate_area_names.py`）で作り直す。ただし実行すると気象庁のサイトに接続する |

## ファイルの置き場所

| 場所 | 中身 |
|---|---|
| [docs/](docs/README.md) | 文書の入口。構成の説明は [docs/dev/architecture.md](docs/dev/architecture.md)、デプロイは [docs/ops/deployment.md](docs/ops/deployment.md)、用語は [docs/glossary.md](docs/glossary.md) |
| [docs/dev/handoff/](docs/dev/handoff/2026-10-25_remaining-local-tasks.md) | 作業の引き継ぎメモ（日付付き。当時の記録で、現行の状態は [STATUS.md](STATUS.md)） |
| [spec.md](spec.md)・[plan.md](plan.md) | 仕様書とフェーズ計画。`PROJECT_PLAN.md` は 2025-12 時点のアーカイブ（冒頭に書いてある） |
| [specs/](specs/README.md) | 個別仕様書の置き場。現時点では書き方のテンプレートだけが入っている |
| `scripts/` | 開発・確認用の単体スクリプト（下の注意を参照） |

## よくある作業（逆引き）

「触る所」の列にある `git grep` は、リポジトリ直下で打つと、同じ値を別の場所に手で書き写している箇所が見つかります。出てきた所も合わせて直してください。

| やりたいこと | 触る所 | 合わせて見る所 | 確かめ方 |
|---|---|---|---|
| API のレート制限（毎分の回数）を変える | `backend/app/config.py` の `rate_limit_general` / `rate_limit_translate` / `rate_limit_safety_guide`（環境変数で上書きもできる設定項目） | `git grep -n "rate_limit" -- backend` で使っている所を、`git grep -n "minute" -- backend/tests docs CLAUDE.md` で値を書き写している文書・テストを探す。[docs/glossary.md](docs/glossary.md) のレート制限の行は数字を手で書いている | 下の確認 1 を全部回す。`backend/tests/test_snapshot_endpoint.py` の `test_レート制限の対象` は一般の制限（既定 60 回）を超える 70 回を送って 429 を期待している。翻訳用・安全ガイド用の値を変えても、それを見張るテストは見つからなかったので、手で確かめる |
| 対応言語を足す・外す | `backend/app/models.py` の `ALLOWED_LANGUAGES`、`frontend/src/i18n/translations.ts`、`frontend/src/hooks/useEventStream.ts` の `VALID_LANGS` | `git grep -n "easy_ja" -- backend frontend/src docs README.md spec.md` で、言語コードを列挙している所を探す。画面の文言・地名・警報名・安全ガイド・交通リンクの見出しなど、16 言語分を持つデータが多数ある。16 言語の数は README・docs にも手で書かれている | 下の確認 1〜3 を全部回す。実測: `ALLOWED_LANGUAGES` から `ne` を 1 つ外すと、`backend/tests/test_safety_guide_endpoint.py` と `backend/tests/test_transit_links.py` が落ちた（フロント側の `VALID_LANGS` を見張るテストは確認していないので、手で合わせる） |
| 画面の CSP（読み込みを許す範囲）を変える | `frontend/src/middleware.ts`。バックエンドの応答ヘッダは `backend/app/main.py`（`X-Frame-Options` を付けている付近） | `git grep -n -e "frame-ancestors" -e "script-src" -- . ':!frontend/src/middleware.ts'` で、書き写している文書・テストを探す。[CLAUDE.md](CLAUDE.md) の「CSP の制約」節は、静的 HTML を書くときの落とし穴の記録 | 下の確認 2 を回す。`frontend/src/__tests__/middleware.test.ts` が、CSP の全項目を並べた期待値と比べている（実測: `object-src 'none'` を `'self'` に変えると 3 件落ちた）。ヘッダの中身が実ブラウザで問題なく働くかはテストでは分からないので、本番ビルドを起動して確かめる |
| 交通の公式リンクを足す・直す | `backend/app/services/transit_links.py` | `git grep -n "transit" -i -- frontend/src backend/tests docs`。ファイル冒頭の説明に「リンクを足したら `scripts/verify_transit_links.py` を通す」とある | 下の確認 1。加えて、リンクの生死は `python scripts/verify_transit_links.py`（各リンク先に接続するスクリプト。このガイドの作成時には実行していない） |
| 警報の判定・地域名（気象庁 API の読み取り） | `backend/app/services/` の `warning_service.py`・`warning_names.py`・`tsunami_service.py`・`volcano_service.py` | [CLAUDE.md](CLAUDE.md) の「気象庁 API の落とし穴」節。実際のレスポンスと形が違うと、エラーが出ないまま 0 件になる | 下の確認 1。テストは作り物のデータでも緑になるので、実データでの確認が要る（`python scripts/verify_warnings_live.py`。気象庁に接続するため、このガイドの作成時には実行していない） |

## 直したあとの確認

最初に、リポジトリ直下から次のように移動し、依存を入れます（初回のみ。ネットワークに接続します）。

1. `cd backend`
2. `python3 -m venv venv`（Windows でも `python -m venv venv`）
3. `venv` を有効にする。Linux/macOS は `source venv/bin/activate`、Windows の PowerShell は `.\venv\Scripts\Activate.ps1`
4. `pip install -r requirements.txt`

確認の本体は次の 3 つです。**数字ではなく「全部 passed」になることを見てください**（テスト件数は増減します）。

1. バックエンドのテスト。`backend` の中で `pytest tests/ -q`。`asyncio_mode` は `backend/pyproject.toml` に書いてあるので追加の指定は要りません
2. フロントエンドのテストと型。リポジトリ直下から `cd frontend`、`npm ci`（初回のみ）、`npm run test:run`、`node ./node_modules/typescript/bin/tsc --noEmit`。テスト時に `NEXT_PUBLIC_API_URL` が必要なら CI と同じく `http://localhost:8000` を環境変数に入れてください（bash: `export NEXT_PUBLIC_API_URL=http://localhost:8000`、PowerShell: `$env:NEXT_PUBLIC_API_URL = "http://localhost:8000"`）
3. 本番ビルド。`frontend` の中で `npm run build`

CI（`.github/workflows/ci.yml`）は上の 1・2・3 に加えて、Playwright の E2E（`npm run test:e2e`）を GitHub 上で回します。E2E は Chromium のダウンロードとバックエンド起動が要るため、手元では [README.md](README.md#e2e-playwright) の手順に従ってください（このガイドの作成時には実行していない）。

### 画面を目で見て確かめる（ローカル限定で起動）

README の起動コマンドは、そのままだと同じネットワークの他の端末からも見える状態で待ち受けます（`backend/run.py` は `0.0.0.0`、`next dev` / `next start` も既定で全インターフェース）。手元で確かめるだけなら、次の自分のマシンだけに閉じた形で起動してください。2 つの端末（ターミナル）を使います。

1. 端末 A（`backend` の中、`venv` を有効にして）: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
2. 端末 B（`frontend` の中。ビルド済みであること）: `npm run start -- -H 127.0.0.1 -p 3000`（bash なら先頭に `NEXT_PUBLIC_API_URL=http://localhost:8000` を付ける）
3. ブラウザで <http://127.0.0.1:3000/> と <http://127.0.0.1:8000/docs> を開く
4. 終わったら両方の端末で Ctrl+C

`npm run dev`（3001 番）では、CSP の都合でブラウザ側の処理が動かず、画面の確認になりません（[CLAUDE.md](CLAUDE.md) の「クライアント挙動の検証」節）。画面は本番ビルドで確認してください。

外部 AI のキー（`GEMINI_API_KEY` / `ANTHROPIC_API_KEY`）が環境変数に入っていると、翻訳や安全ガイドで外部 API が呼ばれる作りです（キーが無ければ内蔵の辞書で動く。`backend/app/services/ai_provider.py`）。外部送信を避けたいときは、これらを設定しない状態で起動してください。キーの値を画面・ログ・文書に出さないでください。

## 壊れたとき

| 症状 | まず見る所 | よくある原因 |
|---|---|---|
| 警報や津波・噴火の表示が、ずっと 0 件 | [CLAUDE.md](CLAUDE.md) の「気象庁 API の落とし穴」節 | 気象庁側の URL・形が違っていて、エラーを握って空にしている。0 件は「警報が無い」とは限らない |
| 画面に何も出ない・操作できない（dev サーバー） | `frontend/src/middleware.ts` の CSP | dev サーバーではブラウザ側の処理が CSP で止まる。本番ビルドで見る |
| 静的 HTML（`frontend/public/`）の言語切替やボタンが効かない | [CLAUDE.md](CLAUDE.md) の「CSP の制約」節 | インライン script・`onclick` が CSP で実行されない |
| API が 429 を返す | `backend/app/config.py` のレート制限 | 短時間にアクセスしすぎ。テストでは `app.main.limiter` を無効にする（[CLAUDE.md](CLAUDE.md) の Testing 節） |
| テストの Settings で秘密がエラーに出た | [CLAUDE.md](CLAUDE.md) の「秘密情報の扱い」節 | 出力を共有・保存する前に中身を確認する |
| E2E の日本語文言の検索が全部落ちる | `frontend/playwright.config.ts` の `locale` | ブラウザの言語が日本語でない |

## 注意が要る所

- `scripts/` の `verify_*.py`・`generate_*.py` の一部は外部サイト（気象庁や各交通機関）に接続します。必要なときだけ、内容を読んでから実行してください
- `start.bat`・`stop.bat` は、作者の旧環境のフォルダ（WSL 上の固定パス）を前提にしているため、そのままでは動かないと思われます（実行して確認はしていません）
- Cloud Run へのデプロイ（`gcloud` を使う手順は [docs/ops/deployment.md](docs/ops/deployment.md) の第 6 節）は、このガイドでは実行していません。本番への公開は所有者の判断です
- 詳細なタスク一覧は各自のローカルだけのメモで、リポジトリには入っていません（[STATUS.md](STATUS.md) の補足を参照）

## 文書の食い違い

- `plan.md`・`spec.md` の一部には古い件数（テスト数など）が残っています。現行の状態は [STATUS.md](STATUS.md) と [CLAUDE.md](CLAUDE.md) のテスト表が新しい側です（書き写された数字は時間が経つと古くなります）
- `README.md` の Project Structure は一部の主要ファイルだけを載せた抜粋で、全ファイルの一覧ではありません

## AI なしでは保守できない所

- [AGENTS.md](AGENTS.md)・[CLAUDE.md](CLAUDE.md) は AI 向けの作業ルールです。この内容が AI にとって良い指示かどうかは、AI に実際に作業させないと分かりません。AI を使わない運用なら、CLAUDE.md は「落とし穴の記録」として読み、従う必要はありません
- 16 言語分の訳文の品質は、機械的なテストでは確かめられません。[STATUS.md](STATUS.md) にあるとおり、専門家・母語話者による翻訳レビューは未実施です

## 用語集

プロジェクトの用語（JMA・SSE・VAPID など）は [docs/glossary.md](docs/glossary.md) にあります。このガイドで使った言葉は次のとおりです。

| 言葉 | 意味 |
|---|---|
| CSP | Content Security Policy。ブラウザに「どこからのスクリプトや画像を読んでよいか」を伝えるヘッダ |
| lockfile | 依存ライブラリのバージョンを固定したファイル（`package-lock.json`）。`npm ci` はこのとおりに入れる |
| E2E | End-to-End。実ブラウザで画面を操作して確かめるテスト（Playwright を使用） |
| Playwright | ブラウザを自動操作するテストツール |
| venv | Python の仮想環境。このリポジトリ専用にライブラリを入れる場所 |
| 429 | 「アクセスしすぎ」を意味する HTTP の応答コード |
| 引き継ぎメモ | `docs/dev/handoff/` の日付付き作業記録 |
| Claude Code / Codex | 作者が使っている AI コーディングツール。[AGENTS.md](AGENTS.md)・[CLAUDE.md](CLAUDE.md) はこれらに読ませる指示書 |
