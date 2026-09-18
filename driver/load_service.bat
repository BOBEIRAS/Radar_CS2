@echo off
setlocal
cd /d "%~dp0"

set "DRIVER_PATH=%~dp0bin\Release\cs2_radar_driver.sys"

if not exist "%DRIVER_PATH%" (
    echo [ERROR] Driver binary not found at:
    echo %DRIVER_PATH%
    echo Please compile the driver in Release x64 first!
    pause
    exit /b 1
)

echo Registering and starting CS2Radar service...
sc create CS2Radar type= kernel binPath= "%DRIVER_PATH%"
sc start CS2Radar

if %errorlevel% equ 0 (
    echo [OK] Kernel driver started successfully!
) else (
    echo [!] Failed to start driver. If you do not have a signed driver, ensure Test Mode is enabled (bcdedit /set testsigning on) or use kdmapper.
)

pause
