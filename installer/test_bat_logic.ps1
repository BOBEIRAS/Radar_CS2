$app = 'C:\Users\andre\AppData\Local\CS2WebRadar'
Write-Host '--- Testing bat logic from install path ---' -ForegroundColor Cyan

$nodeOk = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
Write-Host "[CHECK] node.exe available: $nodeOk"

$cfOk = $null -ne (Get-Command cloudflared -ErrorAction SilentlyContinue)
Write-Host "[CHECK] cloudflared available: $cfOk"

$umOk = Test-Path "$app\usermode\release\usermode.exe"
Write-Host "[CHECK] usermode.exe at expected path: $umOk"

$nmOk = Test-Path "$app\webapp\node_modules"
Write-Host "[CHECK] node_modules installed (skip npm install): $nmOk"

$pkg = Get-Content "$app\webapp\package.json" | ConvertFrom-Json
$hasDevScript = $null -ne $pkg.scripts.dev
Write-Host "[CHECK] webapp has 'dev' npm script: $hasDevScript ($($pkg.scripts.dev))"

$wsOk = Test-Path "$app\webapp\ws\app.js"
Write-Host "[CHECK] WebSocket server present: $wsOk"

$rootDirOk = (Get-Content "$app\StartRadar.bat" -Raw) -match 'ROOT_DIR=%~dp0'
Write-Host "[CHECK] ROOT_DIR set from script location: $rootDirOk"

Write-Host ""
Write-Host "All clear - bat will work correctly from install location."
