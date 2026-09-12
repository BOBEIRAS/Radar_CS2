@echo off
chcp 65001 >nul
cd /d "%~dp0"

title CS2 Web Radar
color 0A

:: Request Admin Privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

cls
echo.
echo  ===================================================================
echo     CS2 WEB RADAR v2.0
echo  ===================================================================
echo.

:: Kill old processes to prevent bugs
taskkill /F /IM node.exe /IM usermode.exe /IM cloudflared.exe >nul 2>&1

:: Start background services
if exist "%temp%\cloudflared.log" del "%temp%\cloudflared.log"
start /b cmd /c "cd /d D:\cs2_webradar\webapp\ws && node app.js" >nul 2>&1
start /b cmd /c "cd /d D:\cs2_webradar\webapp && npm run dev" >nul 2>&1
start /b cmd /c "cloudflared tunnel --url http://localhost:5173" > "%temp%\cloudflared.log" 2>&1

:: Progress Bar
echo  [+] Starting services...
echo.
<nul set /p "=  [ "
for /L %%i in (1,1,20) do (
    <nul set /p "=█"
    timeout /t 1 /nobreak >nul
)
echo  ] 100%%
echo.

echo  ===================================================================
echo     RADAR LINK
echo  ===================================================================
echo.

:: Get Cloudflare URL
powershell -Command "$log = Get-Content '%temp%\cloudflared.log' -Raw -ErrorAction SilentlyContinue; if ($log -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') { Write-Host '  URL -> ' -NoNewline -ForegroundColor Gray; Write-Host $matches[0] -ForegroundColor Cyan } else { Write-Host '  [!] Generating link... Refresh browser in a few seconds.' -ForegroundColor Yellow }"

echo.
echo  ===================================================================
echo     MEMORY READER
echo  ===================================================================
echo.
echo  [+] Launching usermode...

:: Launch C++ Reader with forced Administrator privileges
powershell -Command "Start-Process 'cmd' -ArgumentList '/k cd /d D:\cs2_webradar\usermode\release && usermode.exe' -Verb RunAs"

echo.
echo  [OK] System running. You can minimize this window.
pause