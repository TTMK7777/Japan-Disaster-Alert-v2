#!/bin/bash
# 開発環境起動スクリプト

# nvm を読み込み（非インタラクティブシェルでも動作するように）
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==================================="
echo "災害対応AIシステム - 開発環境起動"
echo "==================================="

# バックエンド起動
echo ""
echo "[1/2] バックエンド起動中..."
cd "$PROJECT_DIR/backend"
if [ ! -d "venv" ]; then
    echo "Python仮想環境を作成中..."
    python3 -m venv venv
    ./venv/bin/pip install -q -r requirements.txt
fi
./venv/bin/python run.py &
BACKEND_PID=$!
echo "バックエンド起動完了 (PID: $BACKEND_PID)"

# フロントエンド起動
echo ""
echo "[2/2] フロントエンド起動中..."
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "npm依存関係をインストール中..."
    npm install
fi
npm run dev &
FRONTEND_PID=$!
echo "フロントエンド起動完了 (PID: $FRONTEND_PID)"

echo ""
echo "==================================="
echo "起動完了!"
echo "==================================="
echo ""
echo "フロントエンド: http://localhost:3001"
echo "バックエンドAPI: http://localhost:8000"
echo "APIドキュメント: http://localhost:8000/docs"
echo ""
echo "停止するには Ctrl+C を押してください"

# 終了シグナルをキャッチして子プロセスを終了
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# プロセスを待機
wait
