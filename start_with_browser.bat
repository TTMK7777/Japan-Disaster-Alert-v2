@echo off
chcp 65001 > nul
echo ===================================
echo 災害対応AIシステム - 起動
echo ===================================
echo.
echo 5秒後にブラウザを開きます...
echo.

:: ブラウザを5秒後に開く（バックエンド起動待ち）
start /min cmd /c "timeout /t 5 /nobreak > nul && start http://localhost:3001"

:: WSL経由でサーバーを起動
wsl -e bash -c "cd ~/Desktop/03_Business-Apps/災害対応AI && ./scripts/start_dev.sh"

pause
