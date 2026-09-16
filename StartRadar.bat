@echo off
chcp 65001 >nul
title CS2 Web Radar - Launcher
color 0A

:: 0. Unblock executables downloaded from internet (removes security warning popup)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Include '*.bat','*.ps1','*.exe','*.vbs','*.js' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1

:: 1. Request Administrator Privileges
net session >nul 2>&1
if %errorlevel% equ 0 goto :MAIN

:: Not admin - re-launch elevated via VBScript (most reliable UAC method)
echo Set UAC = CreateObject("Shell.Application") > "%temp%\cs2radar_admin.vbs"
echo UAC.ShellExecute "%~f0", "", "%~dp0", "runas", 1 >> "%temp%\cs2radar_admin.vbs"
cscript //nologo "%temp%\cs2radar_admin.vbs"
del /f /q "%temp%\cs2radar_admin.vbs" >nul 2>&1
exit /b

:MAIN
:: Fix working directory to script location
cd /d "%~dp0"
set "ROOT_DIR=%~dp0"


cls
echo ===================================================================
echo     CS2 WEB RADAR - LAUNCHER
echo ===================================================================
echo.

:: ===================================================================
:: 2. Auto-install Node.js if missing
:: ===================================================================
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js not found. Attempting automatic installation...
    echo.

    :: Try winget first (available on Windows 10 1809+ and Windows 11)
    winget --version >nul 2>&1
    if %errorlevel% equ 0 (
        echo [+] Installing Node.js LTS via winget...
        winget install OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo [+] winget not available. Downloading Node.js installer...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/lts/node-lts-latest-x64.msi' -OutFile '%temp%\nodejs_setup.msi' -UseBasicParsing"
        echo [+] Running Node.js installer (follow the prompts)...
        msiexec /i "%temp%\nodejs_setup.msi" /qb ADDLOCAL=ALL
    )

    :: Refresh PATH so node is available in this session
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"Machine\")"') do set "PATH=%%i;%PATH%"

    :: Verify install succeeded
    node --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Node.js installation failed or requires a restart.
        echo Please restart your computer and run this script again.
        echo Or install manually from: https://nodejs.org/
        echo.
        pause
        exit /b
    )
    echo [OK] Node.js installed successfully!
    echo.
)

:: ===================================================================
:: 3. Auto-install Cloudflare Tunnel (cloudflared) if missing
:: ===================================================================
cloudflared --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] cloudflared not found. Attempting automatic installation...

    winget --version >nul 2>&1
    if %errorlevel% equ 0 (
        echo [+] Installing cloudflared via winget...
        winget install Cloudflare.cloudflared -e --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo [+] Downloading cloudflared directly...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi' -OutFile '%temp%\cloudflared_setup.msi' -UseBasicParsing"
        msiexec /i "%temp%\cloudflared_setup.msi" /qb
    )

    :: Refresh PATH
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"Machine\")"') do set "PATH=%%i;%PATH%"

    cloudflared --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [WARNING] cloudflared could not be installed automatically.
        echo Public sharing link will not be available this session.
        echo You can still access the radar locally at http://localhost:5173
        echo.
    ) else (
        echo [OK] cloudflared installed successfully!
        echo.
    )
)

:: ===================================================================
:: 4. Check if usermode.exe is present
:: ===================================================================
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

:: ===================================================================
:: 5. Kill leftover processes to free ports
:: ===================================================================
echo [1/5] Cleaning up previous processes...
taskkill /F /IM node.exe /IM usermode.exe /IM cloudflared.exe >nul 2>&1

:: ===================================================================
:: 6. Install Node.js dependencies if node_modules is missing
:: ===================================================================
if not exist "%ROOT_DIR%webapp\node_modules" (
    echo [2/5] Installing Node.js dependencies ^(first-time setup^)...
    echo       This only happens once. Please wait...
    echo.
    cd /d "%ROOT_DIR%webapp"
    npm install --no-audit --no-fund
    cd /d "%ROOT_DIR%"
    :: Verify by checking if node_modules was created (more reliable than errorlevel)
    if not exist "%ROOT_DIR%webapp\node_modules" (
        echo.
        echo [ERROR] Failed to install dependencies.
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

:: ===================================================================
:: 7. Start Web Services
:: ===================================================================
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

:: ===================================================================
:: 8. Wait for CS2 before launching memory reader
:: ===================================================================
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