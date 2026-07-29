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

| 層 | コマンド | 件数（2026-07-27 CI 実測） |
|----|----------|------|
| Backend unit | `cd backend && pytest tests/ -v` | 86 |
| Frontend unit | `cd frontend && npm run test:run` | 66 |
| Frontend E2E | `cd frontend && npm run test:e2e` | 28（CI 未実行） |
| Lint | `cd frontend && npm run lint` | - |
| Build | `cd frontend && npm run build` | - |

- `asyncio_mode = "auto"` は `backend/pyproject.toml` で設定済み（`--asyncio-mode=auto` の明示は不要）
- backend の pytest は `HOME=/tmp` を付けると `.env.local` との干渉を避けられる
