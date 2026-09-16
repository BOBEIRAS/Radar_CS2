@echo off
chcp 65001 >nul
title CS2 Web Radar
color 0A

:: Set root directory to wherever this bat lives
cd /d "%~dp0"
set "ROOT_DIR=%~dp0"

cls
echo ===================================================================
echo     CS2 WEB RADAR - LAUNCHING
echo ===================================================================
echo.

:: ===================================================================
:: 1. Check Node.js — auto-install if missing
:: ===================================================================
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js not found. Installing automatically...
    echo.
    winget --version >nul 2>&1
    if %errorlevel% equ 0 (
        echo [+] Installing Node.js LTS via winget...
        winget install OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo [+] Downloading Node.js LTS installer...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "$v=(Invoke-WebRequest 'https://nodejs.org/dist/index.json' -UseBasicParsing|ConvertFrom-Json|Where-Object{$_.lts}|Select-Object -First 1).version; $url='https://nodejs.org/dist/'+$v+'/node-'+$v+'-x64.msi'; Write-Host 'Downloading' $url; Invoke-WebRequest -Uri $url -OutFile '$env:TEMP\nodejs_setup.msi' -UseBasicParsing"
        msiexec /i "%temp%\nodejs_setup.msi" /qb ADDLOCAL=ALL
    )
    :: Refresh PATH
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"Machine\")"') do set "PATH=%%i;%PATH%"
    node --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Node.js installation failed or requires a restart.
        echo Please install from https://nodejs.org/ then run this again.
        echo.
        pause
        exit /b
    )
    echo [OK] Node.js installed!
    echo.
)

:: ===================================================================
:: 2. Check cloudflared — auto-install if missing
:: ===================================================================
cloudflared --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] cloudflared not found. Installing automatically...
    winget --version >nul 2>&1
    if %errorlevel% equ 0 (
        winget install Cloudflare.cloudflared -e --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo [+] Downloading cloudflared...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi' -OutFile '$env:TEMP\cloudflared_setup.msi' -UseBasicParsing"
        msiexec /i "%temp%\cloudflared_setup.msi" /qb
    )
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"Machine\")"') do set "PATH=%%i;%PATH%"
)

:: ===================================================================
:: 3. Check usermode.exe exists
:: ===================================================================
if not exist "%ROOT_DIR%usermode\release\usermode.exe" (
    echo [ERROR] usermode.exe not found in usermode\release\
    echo Please run git pull or re-download the installer.
    echo.
    pause
    exit /b
)

:: ===================================================================
:: 4. Kill any leftover processes
:: ===================================================================
echo [1/4] Cleaning up old processes...
taskkill /F /IM node.exe /IM usermode.exe /IM cloudflared.exe >nul 2>&1

:: ===================================================================
:: 5. Install npm dependencies (first run only)
:: ===================================================================
if not exist "%ROOT_DIR%webapp\node_modules" (
    echo [2/4] Installing dependencies ^(first run, please wait^)...
    echo.
    cd /d "%ROOT_DIR%webapp"
    npm install --no-audit --no-fund
    cd /d "%ROOT_DIR%"
    if not exist "%ROOT_DIR%webapp\node_modules" (
        echo [ERROR] Failed to install dependencies. Check internet connection.
        pause
        exit /b
    )
    echo [OK] Dependencies installed!
    echo.
) else (
    echo [2/4] Dependencies ready.
)

:: ===================================================================
:: 6. Start web server + cloudflare tunnel
:: ===================================================================
echo [3/4] Starting web server and tunnel...
if exist "%temp%\cloudflared.log" del /f /q "%temp%\cloudflared.log" >nul 2>&1

start /b cmd /c "cd /d "%ROOT_DIR%webapp" && npm run dev" >nul 2>&1
start /b cmd /c "cloudflared tunnel --url http://localhost:5173" > "%temp%\cloudflared.log" 2>&1

echo.
echo ===================================================================
echo     SHARING LINK (CLOUDFLARE)
echo ===================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%scripts\tunnel.ps1"

:: ===================================================================
:: 7. Wait for CS2, then launch memory reader
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
    echo     [!] CS2 not detected — waiting...
    timeout /t 3 /nobreak >nul
    goto check_cs2
)

echo     [OK] CS2 detected! Starting memory reader...
echo.

:: Launch usermode.exe — it will request its own UAC if needed
start "CS2 Radar - Memory Reader" cmd /k "cd /d "%ROOT_DIR%usermode\release" && usermode.exe"

echo ===================================================================
echo     RADAR IS LIVE
echo ===================================================================
echo.
echo   Local:    http://localhost:5173
echo   Friends:  use the Cloudflare link above (Ctrl+V)
echo.
echo   Minimise this window during your game.
echo   Close this window to stop the radar.
echo.
pause