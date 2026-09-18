@echo off
setlocal

echo Stopping and removing CS2Radar service...
sc stop CS2Radar
sc delete CS2Radar

echo [OK] Service removed.
pause
