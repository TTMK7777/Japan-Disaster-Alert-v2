# Japan-Disaster-Alert

## Stack
- Backend: FastAPI (Python 3.11+), slowapi rate limiting
- Frontend: Next.js, 16-language i18n

## Structure
- `backend/app/main.py`: FastAPI アプリエントリポイント
- `backend/app/services/`: 地震API・AI分析サービス
- `backend/app/models.py`: データモデル
- `backend/app/config.py`: 設定
- `backend/tests/`: pytest テスト
- `frontend/src/i18n/`: 翻訳ファイル（16言語）
- `frontend/src/types/earthquake.ts`: 共有TypeScript型定義
- `frontend/src/config/`: API設定

## Conventions
- API変更時は `frontend/src/types/` の型定義も更新
- ユーザー向け文字列は16言語対応必須（`frontend/src/i18n/`）
- Backend例外は `backend/app/exceptions.py` に定義

## Testing / Proof
変更後は該当する層を必ず実行する（CI が回すのは backend pytest と frontend vitest の2つのみ。E2E はローカル実行）。

| 層 | コマンド | 件数（2026-07-30 実測） |
|----|----------|------|
| Backend unit | `cd backend && pytest tests/ -v` | 519 |
| Frontend unit | `cd frontend && npm run test:run` | 102 |
| Frontend E2E | `cd frontend && npm run test:e2e` | 28（CI 未実行） |
| 型チェック | `cd frontend && node ./node_modules/typescript/bin/tsc --noEmit` | - |
| Build | `cd frontend && npm run build` | - |

- `asyncio_mode = "auto"` は `backend/pyproject.toml` で設定済み（`--asyncio-mode=auto` の明示は不要）
- backend の pytest は**素の `pytest tests/ -q` で通る**（ホームの退避は不要）。
  以前は `Settings` がユーザーのグローバル env を読んでいたため退避が必要だったが、
  2026-07-31 に `env_file` をリポジトリ内に限定し `extra="ignore"` を入れて解消した
- **レート制限のあるエンドポイントをテストするときは limiter を無効化する。**
  `monkeypatch.setattr(limiter, "enabled", False)`（`app.main.limiter`）。
  例: `/api/v1/safety-guide` は 10回/分 のため、パラメトライズすると 429 で落ちる
- **`npm run lint` は proof に使えない**: ESLint が未設定のため対話プロンプト（設定方式の選択）に入って停止する。型チェックは上記の `tsc --noEmit` を使う
- `npx` は環境の deny 対象。リポジトリ定義の npm script（`npm run test:run` 等）か `node ./node_modules/...` を直接呼ぶ

## クライアント挙動の検証（重要な落とし穴）

**`npm run dev` ではクライアント側 React が動かない。** `src/middleware.ts` の CSP が `unsafe-eval` を許可しないため、Next.js dev の react-refresh が
`EvalError: ... 'unsafe-eval' is not an allowed source of script` で失敗し、**useEffect が一切実行されない**（SSR の HTML だけが見える状態）。

localStorage・言語判定・SSE などクライアント挙動を検証するときは **production build で行う**:

```bash
cd frontend && npm run build && npm run start   # http://localhost:3000
```

ブラウザ言語による挙動を確認する場合は Chrome を言語指定で起動する（`--lang` は `navigator.languages` に反映される）:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --no-first-run --user-data-dir=<一時ディレクトリ> --lang=ko-KR \
  --virtual-time-budget=9000 --dump-dom http://localhost:3000
```

抽出結果を Bash に直接 print すると端末が cp932 で落ちるため、**ファイルに書いて Read する**。

なお `--window-size=460` を指定しても headless の `innerWidth` は 512 になる（最小幅）。
`--screenshot` は指定幅で切り取るため、**スクショの右端が切れていても実際のはみ出しとは限らない**。
レイアウトを疑うときは `document.documentElement.scrollWidth` と `window.innerWidth` を実測する。

## 秘密情報の扱い（2026-07-30 のインシデントを踏まえた恒久ルール）

**`app` を import する Python 実行はすべて**（pytest に限らず `python -c` / `python -` の
調査実行も含む）、設定読み込みが秘密を出力しうる前提で扱う。

- **設定のバリデーションエラーは値を平文で出す。** pydantic の `extra_forbidden` は
  `input_value=<実際の値>` をメッセージに載せる。**エラーだから中身が無い、は誤り**
- 想定外に失敗したコマンドの出力を**ファイルに落として全文 Read しない**。
  まず `2>&1 | tail -5` 等で量と種類（トレースバックか否か）を見る
- `Settings` の `env_file` に**ユーザーのホーム配下を足さない**。足すと、このアプリと
  無関係な他プロジェクトのキーまで読み込む構成になる（回帰テストで固定済み）

> ルールは「よくやる操作」ではなく「**危険が発生する条件**」で書くこと。
> 事故時の旧ルールは「**pytest** はホームを退避」と操作名で書かれていたため、
> `python -` での調査実行にすり抜けた。

## CSP の制約（`public/` の静的 HTML を書くとき必ず踏む）

`src/middleware.ts` の CSP は `script-src 'self' 'nonce-...'` で、**`unsafe-inline` を含まない**。

- **インライン `<script>` は実行されない。** 同一オリジンの外部ファイル（`<script src="/foo.js">`）にする
- **`onclick` 等のイベントハンドラ属性も実行されない。** `addEventListener` を使う
- **Service Worker はレスポンスヘッダごとキャッシュする**ため、オフライン時も CSP は効いたまま。
  「オフラインなら CSP は無いだろう」は誤り
- `style-src` には `'unsafe-inline'` があるのでインライン `<style>` は使える

実例: `public/offline.html` を最初インラインスクリプトで書いたところ、言語切替が動かず
行動指示が空欄で表示された（`src/__tests__/offline-page.test.ts` に再発防止テストあり）。
