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

| 層 | コマンド | 件数（backend=2026-07-27 CI 実測 / frontend=2026-07-30 ローカル実測） |
|----|----------|------|
| Backend unit | `cd backend && pytest tests/ -v` | 86 |
| Frontend unit | `cd frontend && npm run test:run` | 84 |
| Frontend E2E | `cd frontend && npm run test:e2e` | 28（CI 未実行） |
| 型チェック | `cd frontend && node ./node_modules/typescript/bin/tsc --noEmit` | - |
| Build | `cd frontend && npm run build` | - |

- `asyncio_mode = "auto"` は `backend/pyproject.toml` で設定済み（`--asyncio-mode=auto` の明示は不要）
- backend の pytest は `HOME=/tmp` を付けると `.env.local` との干渉を避けられる
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
