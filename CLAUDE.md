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

| 層 | コマンド | 件数（2026-08-04 実測） |
|----|----------|------|
| Backend unit | `cd backend && pytest tests/ -v` | 1031 |
| Frontend unit | `cd frontend && npm run test:run` | 126 |
| Frontend E2E | 下記「E2E を動かすとき」を参照 | 33（CI 未実行） |
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

## E2E を動かすとき（2026-08-01 に3つ踏んだ）

```bash
cd frontend && npm run build   # 先にビルドが要る（下記2つ目の理由）
node ./node_modules/@playwright/test/cli.js test --config playwright.local-chrome.config.ts
```

1. **ブラウザバイナリが入っていないことがある。** `npx playwright install` は
   この環境では使えない（`npx` が deny／ダウンロードを伴う）。
   `playwright.local-chrome.config.ts` は**インストール済みの Google Chrome を使う**
   （`channel: 'chrome'`）ので、ダウンロードなしで走る
2. **`npm run dev` ではクライアント React が動かない**（後述の CSP の項）。
   `useEffect` が実行されないので、**fetch を伴う画面は必ず空になる**。
   ローカル用 config は `npm run start` を使う。既定の `playwright.config.ts` は
   `npm run dev` のままなので、クライアント挙動を見るテストは信用しないこと
3. **ロケールを固定しないと日本語の文言を探すテストが全部落ちる。**
   初回訪問時はブラウザ言語から表示言語を推定するため（`src/i18n/detectLanguage.ts`）、
   実行環境が英語だと UI が英語になる。両 config に `locale: 'ja-JP'` を入れてある。
   これが無かったため **28件中12件が壊れたまま放置されていた**（E2E は CI 未実行で気付けない）。
   新しいテストは言語に依存しないよう `#tab-emergency` のような **id で要素を選ぶ**

## 気象庁 API の落とし穴（2026-08-01 に4件まとめて踏んだ）

**合成フィクスチャで緑になっても、実レスポンスに当てるまで信用しない。**
以下はすべて「自分が想像した形」のフィクスチャで緑だったが、本番では壊れていた。

1. **警報 JSON に地域名は入っていない。** `areaTypes[].areas[]` は `code` と `warnings` だけで
   `name` キーは**存在しない**。地名は `/bosai/common/const/area.json` からコードで引く
   （生成物 = `backend/app/services/area_names.py`、生成 = `scripts/generate_area_names.py`）
2. **`status` は「発表」だけではない。** 最初に出したときが「発表」で、以降の定時更新は
   **「継続」**に変わる。「発表」だけを通すと**継続中の警報が全部消える**。
   ほかに「解除」「発表警報・注意報はなし」がある
3. **「1都道府県 = 1予報区」ではない。** 府県予報区は **58件**（47ではない）で、
   北海道8・沖縄4・鹿児島2 に分かれている。存在しないコード（例 `460000`）を投げると
   404 になり、`httpx.HTTPError` を握って `[]` を返すので**エラーも出ずに永久ゼロ件**になる。
   都道府県で警報を見るときは `expand_to_offices()` で全予報区に広げること
   （代表コードだけだと北海道は石狩・空知・後志のみ、沖縄は本島のみになる）
4. **`areaTypes` は2階層。** `[0]` が一次細分区域（6桁）、`[1]` が市町村（7桁）。
   両方を混ぜて表示すると市町村30件が読点で連なる

実データでの受け入れ確認は `python scripts/verify_warnings_live.py`（要 UTF-8 リダイレクト）。
**「0 件」は「警報が無い」とは限らない**（404 でも 0 件になる）ので、
コードが実在する予報区かは `backend/tests/test_area_codes_coverage.py` が固定している。

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
