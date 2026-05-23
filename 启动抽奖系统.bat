@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 年会抽奖系统

echo ══════════════════════════════════════
echo    年会抽奖系统 v2.0
echo ══════════════════════════════════════
echo.
echo  正在启动，请稍候...
echo.

"%~dp0node-portable\node.exe" server.js

pause
