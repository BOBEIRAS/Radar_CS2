@echo off
chcp 65001 >nul
title CS2 Web Radar - Launcher
color 0A

:: 1. Request Administrator Privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [i] Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c call `\"\"%~f0\"\"' -Verb RunAs" 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo  [WARNING] Could not auto-elevate privileges.
        echo  Right-click on 'StartRadar.bat' and choose 'Run as Administrator'.
        echo.
        pause
    )
    exit /b
)

:: Fix working directory to script location
cd /d "%~dp0"
set "ROOT_DIR=%~dp0"

cls
echo ===================================================================
echo     CS2 WEB RADAR - LAUNCHER
echo ===================================================================
echo.

:: 2. Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Then restart your computer and run this script again.
    echo.
    pause
    exit /b
)

:: 3. Check if usermode.exe is present
if not exist "%ROOT_DIR%usermode\release\usermode.exe" (
    echo [ERROR] usermode.exe not found in usermode\release\
    echo.
    echo The memory reader binary is missing.
    echo You have two options:
    echo   1. Compile the project in Visual Studio ^(Release x64^)
    echo   2. Run git pull to download the latest pre-built binary
    echo.
    pause
    exit /b
)

:: 4. Kill any leftover processes to free ports
echo [1/5] Cleaning up previous processes...
taskkill /F /IM node.exe /IM usermode.exe /IM cloudflared.exe >nul 2>&1

:: 5. Install Node.js dependencies if node_modules is missing
if not exist "%ROOT_DIR%webapp\node_modules" (
    echo [2/5] Installing Node.js dependencies ^(first-time setup^)...
    echo       This only happens once. Please wait...
    echo.
    cd /d "%ROOT_DIR%webapp"
    npm install --no-audit --no-fund
    cd /d "%ROOT_DIR%"
    :: Check if node_modules was actually created (more reliable than errorlevel)
    if not exist "%ROOT_DIR%webapp\node_modules" (
        echo.
        echo [ERROR] Dependency installation failed.
        echo Please check your internet connection and try again.
        pause
        exit /b
    )
    echo.
    echo [OK] Dependencies installed successfully!
    echo.
) else (
    echo [2/5] Dependencies already installed. Continuing...
)

:: 6. Start Web Services (Vite dev server via concurrently includes ws/app.js, plus Cloudflare Tunnel)
echo [3/5] Starting WebSocket server and web interface...
if exist "%temp%\cloudflared.log" del /f /q "%temp%\cloudflared.log" >nul 2>&1

start /b cmd /c "cd /d "%ROOT_DIR%webapp" && npm run dev" >nul 2>&1
start /b cmd /c "cloudflared tunnel --url http://localhost:5173" > "%temp%\cloudflared.log" 2>&1

echo.
echo ===================================================================
echo     RADAR LINK (CLOUDFLARE TUNNEL)
echo ===================================================================
echo.
echo [4/5] Generating public link to share with friends...

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%scripts\tunnel.ps1"

echo.
echo ===================================================================
echo     CS2 VALIDATION AND MEMORY READER
echo ===================================================================
echo.

:: 7. Wait for CS2 to be running before launching the memory reader
echo [5/5] Checking if Counter-Strike 2 (cs2.exe) is running...

:check_cs2
tasklist /FI "IMAGENAME eq cs2.exe" 2>nul | find /I "cs2.exe" >nul
if %errorlevel% neq 0 (
    echo [!] CS2 not detected. Please open Counter-Strike 2 to continue...
    timeout /t 3 /nobreak >nul
    goto check_cs2
)

echo [OK] Counter-Strike 2 detected!
echo.
echo [+] Starting memory reader (usermode.exe)...

start "CS2 Radar Memory Reader" cmd /k "cd /d "%ROOT_DIR%usermode\release" && usermode.exe"

echo.
echo ===================================================================
echo     RADAR ACTIVE AND RUNNING
echo ===================================================================
echo.
echo [OK] All services are operational.
echo.
echo Local access:     http://localhost:5173
echo Friends access:   use the Cloudflare link copied above ^(Ctrl+V^)
echo.
echo You can minimize this window during your game session.
echo To stop the radar, simply close this window.
echo.
pause