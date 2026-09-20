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

# 0. Fechar processos em execucao que possam bloquear ficheiros
Get-Process -Name "CS2WEBRADAR", "launcher", "usermode", "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

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
$DistSrc   = Join-Path $WebappDir "dist"

Push-Location $WebappDir
cmd.exe /c "npm run build" 2>&1 | Out-Null
Pop-Location

if (Test-Path $DistSrc) {
    Write-Host "  [OK] Webapp compilada em $DistSrc." -ForegroundColor Green
} else {
    Write-Host "  [ERRO] npm run build falhou e pasta dist nao existe." -ForegroundColor Red
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

# usermode.exe (memory reader)
$UsermodeSrc = Join-Path $Root "usermode\release\usermode.exe"
if (Test-Path $UsermodeSrc) {
    $UsermodeDst = Join-Path $OutDir "usermode\release"
    New-Item -ItemType Directory -Path $UsermodeDst -Force | Out-Null
    Copy-Item $UsermodeSrc $UsermodeDst -Force
    # Copia tambem para release na raiz por compatibilidade
    $RelDst = Join-Path $OutDir "release"
    New-Item -ItemType Directory -Path $RelDst -Force | Out-Null
    Copy-Item $UsermodeSrc $RelDst -Force
    Write-Host "  [OK] usermode.exe copiado." -ForegroundColor Green
} else {
    Write-Host "  [AVISO] usermode.exe nao encontrado em $UsermodeSrc." -ForegroundColor Red
}

# dist (webapp built) — apenas webapp/dist (onde app.js serve os ficheiros)
$WebappOutDir = Join-Path $OutDir "webapp"
New-Item -ItemType Directory -Path $WebappOutDir -Force | Out-Null
Copy-Item $DistSrc (Join-Path $WebappOutDir "dist") -Recurse -Force

# webapp/ws (node backend + pre-installed dependencies)
$WsOutDir = Join-Path $OutDir "webapp\ws"
New-Item -ItemType Directory -Path $WsOutDir -Force | Out-Null
"app.js","package.json","package-lock.json" | ForEach-Object {
    $f = Join-Path $Root "webapp\ws\$_"
    if (Test-Path $f) { Copy-Item $f $WsOutDir }
}
$WsModules = Join-Path $Root "webapp\ws\node_modules"
if (Test-Path $WsModules) {
    Copy-Item $WsModules $WsOutDir -Recurse -Force
}
Write-Host "  [OK]" -ForegroundColor Green

# 5. ZIP  (usa .NET ZipFile — muito mais rapido que Compress-Archive com node_modules)
Write-Host "[6/6] A criar ZIP..." -ForegroundColor Yellow
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($OutDir, $ZipPath)
Remove-Item $OutDir -Recurse -Force

# Atualiza tambem o exe de admin na raiz
$AdminExe = Join-Path $Root "CS2WEBRADAR.exe"
Copy-Item (Join-Path $PublishOut "launcher.exe") $AdminExe -Force
Write-Host "  [OK] CS2WEBRADAR.exe (admin) atualizado." -ForegroundColor Green

Write-Host ""
Write-Host "=== CONCLUIDO ===" -ForegroundColor Green
Write-Host "  Ficheiro: $ZipPath"
Write-Host ""
Write-Host "  Lembra-te:" -ForegroundColor DarkYellow
Write-Host "   * NAO inclui: admin.key, license.key, source code"
Write-Host "   * Envia o ZIP + a license key gerada no Keygen para o cliente"
Write-Host ""

Start-Process "explorer.exe" "/select,`"$ZipPath`""
