@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 公网隧道

echo  正在连接公网隧道...
echo.

:loop
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 80:localhost:3000 nokey@localhost.run
echo.
echo ═══════════════════════════════════════
echo  隧道已断开，5秒后重连...
echo ═══════════════════════════════════════
timeout /t 5 /nobreak >nul
goto loop
