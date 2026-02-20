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

## Testing
- Backend: `cd backend && pytest tests/ -v`
