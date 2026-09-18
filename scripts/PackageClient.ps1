# ============================================================
#  CS2 Web Radar — Client Package Builder
#  Gera um ZIP limpo pronto a enviar ao cliente.
#  Uso: powershell -ExecutionPolicy Bypass -File scripts\PackageClient.ps1
# ============================================================

$Root    = Split-Path $PSScriptRoot -Parent
$OutName = "CS2WebRadar_Client_$(Get-Date -Format 'yyyyMMdd')"
$OutDir  = Join-Path $Root $OutName
$ZipPath = Join-Path $Root "$OutName.zip"

Write-Host ""
Write-Host "=== CS2 Web Radar - Empacotador de Cliente ===" -ForegroundColor Cyan
Write-Host "  Root   : $Root"
Write-Host "  Output : $ZipPath"
Write-Host ""

# 0. Limpar pasta temporaria
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null

# 1. Compilar launcher
Write-Host "[1/5] A compilar launcher..." -ForegroundColor Yellow
$LauncherSrc = Join-Path $Root "launcher"
$PublishOut  = Join-Path $LauncherSrc "publish_standalone"

dotnet publish "$LauncherSrc" -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -o "$PublishOut" --nologo -v quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERRO] Build falhou." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Compilado." -ForegroundColor Green

# 2. Build webapp
Write-Host "[2/6] A compilar webapp (npm run build)..." -ForegroundColor Yellow
$WebappDir = Join-Path $Root "webapp"
Push-Location $WebappDir
npm run build 2>&1 | Out-Null
Pop-Location
if (Test-Path (Join-Path $Root "dist")) {
    Write-Host "  [OK] Webapp compilada." -ForegroundColor Green
} else {
    Write-Host "  [ERRO] npm run build falhou." -ForegroundColor Red
    exit 1
}

# 3. Copiar exe
Write-Host "[3/6] A copiar executavel..." -ForegroundColor Yellow
Copy-Item (Join-Path $PublishOut "launcher.exe") (Join-Path $OutDir "CS2WebRadar.exe")
Write-Host "  [OK]" -ForegroundColor Green

# 4. Config e offsets
Write-Host "[4/6] A copiar config..." -ForegroundColor Yellow
Copy-Item (Join-Path $Root "config.json")  $OutDir
Copy-Item (Join-Path $Root "offsets.json") $OutDir
Write-Host "  [OK]" -ForegroundColor Green

# 4. Pastas
Write-Host "[5/6] A copiar pastas..." -ForegroundColor Yellow

# installer: apenas cloudflared + nodejs_portable
$InstDst = Join-Path $OutDir "installer"
New-Item -ItemType Directory -Path $InstDst | Out-Null
Copy-Item (Join-Path $Root "installer\cloudflared.exe") $InstDst
$NodeSrc = Join-Path $Root "installer\nodejs_portable"
if (Test-Path $NodeSrc) { Copy-Item $NodeSrc $InstDst -Recurse }

# release (usermode.exe)
$RelSrc = Join-Path $Root "release"
if (Test-Path $RelSrc) {
    Copy-Item $RelSrc $OutDir -Recurse
} else {
    Write-Host "  [AVISO] Pasta 'release' nao encontrada." -ForegroundColor DarkYellow
}

# dist (webapp built)
$DistSrc = Join-Path $Root "dist"
if (Test-Path $DistSrc) {
    Copy-Item $DistSrc $OutDir -Recurse
} else {
    Write-Host "  [AVISO] Pasta 'dist' nao encontrada - corre npm run build na webapp." -ForegroundColor DarkYellow
}

# webapp/ws (node backend)
$WsOutDir = Join-Path $OutDir "webapp\ws"
New-Item -ItemType Directory -Path $WsOutDir -Force | Out-Null
"app.js","package.json","package-lock.json" | ForEach-Object {
    $f = Join-Path $Root "webapp\ws\$_"
    if (Test-Path $f) { Copy-Item $f $WsOutDir }
}
Write-Host "  [OK]" -ForegroundColor Green

# 5. ZIP
Write-Host "[6/6] A criar ZIP..." -ForegroundColor Yellow
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$OutDir\*" -DestinationPath $ZipPath
Remove-Item $OutDir -Recurse -Force

Write-Host ""
Write-Host "=== CONCLUIDO ===" -ForegroundColor Green
Write-Host "  Ficheiro: $ZipPath"
Write-Host ""
Write-Host "  Lembra-te:" -ForegroundColor DarkYellow
Write-Host "   * NAO inclui: admin.key, license.key, source code"
Write-Host "   * Envia o ZIP + a license key gerada no Keygen para o cliente"
Write-Host ""

Start-Process "explorer.exe" "/select,`"$ZipPath`""
