@echo off
chcp 65001 > nul
echo ===================================
echo 災害対応AIシステム - 停止
echo ===================================
echo.
echo バックエンド・フロントエンドのプロセスを停止します...
echo.

wsl -e bash -c "pkill -f 'python.*run.py' 2>/dev/null; pkill -f 'node.*next' 2>/dev/null; echo '停止完了'"

echo.
echo ===================================
pause
