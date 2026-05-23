@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 年会抽奖系统 - 公网版

echo ══════════════════════════════════════
echo    年会抽奖系统 v2.0 - 公网版
echo ══════════════════════════════════════
echo.

:: 检测可用 Node.js
set NODE=
if exist "%~dp0node-portable\node.exe" set NODE=%~dp0node-portable\node.exe
if "%NODE%"=="" if exist "%ProgramFiles%\nodejs\node.exe" set NODE=%ProgramFiles%\nodejs\node.exe
if "%NODE%"=="" if exist "%AppData%\nvm\v20.18.0\node.exe" set NODE=%AppData%\nvm\v20.18.0\node.exe
if "%NODE%"=="" set NODE=node

echo  [1/3] 启动服务...
start "抽奖系统服务" /B "%NODE%" server.js
timeout /t 2 /nobreak >nul

echo  [2/3] 连接公网隧道...
echo   (首次连接可能需要几秒钟)
echo.

:: 使用 PowerShell 启动隧道（后台运行）
start "抽奖系统隧道" /MIN cmd /c "ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run 2>&1 | findstr lhr.life > tunnel-url.txt"

:: 等待隧道连接
set URL=
for /l %%i in (1,1,20) do (
  timeout /t 1 /nobreak >nul
  if exist tunnel-url.txt (
    for /f "usebackq delims=" %%u in (tunnel-url.txt) do set URL=%%u
    if not "!URL!"=="" goto :got_url
  )
)
:got_url

echo.
echo ═══════════════════════════════════════
if not "%URL%"=="" (
  echo  公网地址: %URL%
  echo  大屏幕:   %URL%/
  echo  扫码参与: %URL%/join.html
  echo  二维码:   %URL%/api/qrcode.png
  start "" "%URL%"
) else (
  echo  隧道连接中... 请稍后查看 tunnel-url.txt
)
echo ═══════════════════════════════════════
echo.
echo  按 Ctrl+C 停止服务
echo.

:: 保持窗口打开
:loop
timeout /t 10 /nobreak >nul
if not "%URL%"=="" (
  if exist tunnel-url.txt (
    for /f "usebackq delims=" %%u in (tunnel-url.txt) do (
      if not "%%u"=="%URL%" (
        set URL=%%u
        cls
        echo ═══════════════════════════════════════
        echo  公网地址已更新: %URL%
        echo  大屏幕:   %URL%/
        echo  扫码参与: %URL%/join.html
        echo ═══════════════════════════════════════
      )
    )
  )
)
goto :loop
