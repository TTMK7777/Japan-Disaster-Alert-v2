@echo off
chcp 65001 > nul
echo ===================================
echo 災害対応AIシステム - 起動
echo ===================================
echo.
echo WSL経由でバックエンド・フロントエンドを起動します...
echo.
echo フロントエンド: http://localhost:3001
echo バックエンドAPI: http://localhost:8000
echo APIドキュメント: http://localhost:8000/docs
echo.
echo 停止するには このウィンドウを閉じてください
echo ===================================
echo.

wsl -e bash -c "cd ~/Desktop/03_Business-Apps/災害対応AI && ./scripts/start_dev.sh"

pause
