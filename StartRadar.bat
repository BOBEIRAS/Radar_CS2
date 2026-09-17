@echo off
chcp 65001 >nul
setlocal EnableExtensions
title CS2 Web Radar
color 0A

cd /d "%~dp0"
set "ROOT_DIR=%~dp0"
set "NODE_EXE=%ROOT_DIR%installer\nodejs_portable\node.exe"
set "CLOUDFLARED_EXE=%ROOT_DIR%installer\cloudflared.exe"
set "SERVER_PORT=22006"
set "SERVER_LOG=%temp%\cs2_webradar_server.log"
set "CLOUDFLARED_LOG=%temp%\cloudflared.log"

for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "try { (Get-Content '%ROOT_DIR%config.json' -Raw | ConvertFrom-Json).server.port } catch { '' }"`) do (
    if not "%%i"=="" set "SERVER_PORT=%%i"
)

cls
echo ===================================================================
echo     CS2 WEB RADAR - LAUNCHING
echo ===================================================================
echo.

:: ===================================================================
:: 1. Runtime checks
:: ===================================================================
if not exist "%NODE_EXE%" (
    node --version >nul 2>&1
    if %errorlevel% equ 0 (
        for /f "tokens=*" %%i in ('where node 2^>nul') do (
            if not defined NODE_FOUND set "NODE_FOUND=%%i"
        )
        set "NODE_EXE=%NODE_FOUND%"
    )
)

if not exist "%NODE_EXE%" (
    echo [ERROR] Portable Node.js was not found.
    echo Expected: %ROOT_DIR%installer\nodejs_portable\node.exe
    echo.
    echo Rebuild the installer after running:
    echo   powershell -ExecutionPolicy Bypass -File installer\download_nodejs_portable.ps1
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT_DIR%webapp\dist\index.html" (
    echo [ERROR] Frontend build was not found.
    echo Expected: %ROOT_DIR%webapp\dist\index.html
    echo.
    echo Build the frontend before creating the installer:
    echo   cd webapp
    echo   npm run build
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT_DIR%webapp\node_modules\ws" (
    echo [ERROR] Runtime WebSocket dependency was not found.
    echo Expected: %ROOT_DIR%webapp\node_modules\ws
    echo.
    echo The installer must include webapp\node_modules\ws.
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT_DIR%usermode\release\usermode.exe" (
    echo [ERROR] usermode.exe not found in usermode\release\
    echo Please re-download or reinstall CS2 Web Radar.
    echo.
    pause
    exit /b 1
)

if not exist "%CLOUDFLARED_EXE%" (
    cloudflared --version >nul 2>&1
    if %errorlevel% equ 0 (
        for /f "tokens=*" %%i in ('where cloudflared 2^>nul') do (
            if not defined CLOUDFLARED_FOUND set "CLOUDFLARED_FOUND=%%i"
        )
        set "CLOUDFLARED_EXE=%CLOUDFLARED_FOUND%"
    ) else (
        set "CLOUDFLARED_EXE="
    )
)

:: ===================================================================
:: 2. Kill any leftover processes
:: ===================================================================
echo [1/4] Cleaning up old processes...
taskkill /F /IM node.exe /IM usermode.exe /IM cloudflared.exe >nul 2>&1

:: ===================================================================
:: 3. Start web server
:: ===================================================================
echo [2/4] Starting local web server...
if exist "%SERVER_LOG%" del /f /q "%SERVER_LOG%" >nul 2>&1
start "CS2 Radar - Web Server" /min cmd /c ""%NODE_EXE%" "%ROOT_DIR%webapp\ws\app.js" > "%SERVER_LOG%" 2>&1"
timeout /t 2 /nobreak >nul

:: ===================================================================
:: 4. Start Cloudflare tunnel if available
:: ===================================================================
echo [3/4] Preparing sharing link...
if exist "%CLOUDFLARED_LOG%" del /f /q "%CLOUDFLARED_LOG%" >nul 2>&1

if defined CLOUDFLARED_EXE (
    start "CS2 Radar - Cloudflare Tunnel" /min cmd /c ""%CLOUDFLARED_EXE%" tunnel --url http://localhost:%SERVER_PORT% > "%CLOUDFLARED_LOG%" 2>&1"
    echo.
    echo ===================================================================
    echo     SHARING LINK (CLOUDFLARE)
    echo ===================================================================
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%scripts\tunnel.ps1"
) else (
    echo [!] cloudflared.exe not bundled. Public sharing link disabled.
    echo     Local radar will still work at http://localhost:%SERVER_PORT%
)

:: ===================================================================
:: 5. Wait for CS2, then launch memory reader
:: ===================================================================
echo.
echo ===================================================================
echo     WAITING FOR COUNTER-STRIKE 2
echo ===================================================================
echo.
echo [4/4] Open Counter-Strike 2 if it is not already running...
echo.

:check_cs2
tasklist /FI "IMAGENAME eq cs2.exe" 2>nul | find /I "cs2.exe" >nul
if %errorlevel% neq 0 (
    echo     [!] CS2 not detected - waiting...
    timeout /t 3 /nobreak >nul
    goto check_cs2
)

echo     [OK] CS2 detected! Starting memory reader...
echo.

start "CS2 Radar - Memory Reader" cmd /k "cd /d ""%ROOT_DIR%usermode\release"" && usermode.exe"

echo ===================================================================
echo     RADAR IS LIVE
echo ===================================================================
echo.
echo   Local:    http://localhost:%SERVER_PORT%
if defined CLOUDFLARED_EXE echo   Friends:  use the Cloudflare link above (Ctrl+V)
echo.
echo   Minimise this window during your game.
echo   Close this window to stop the radar.
echo.
pause
