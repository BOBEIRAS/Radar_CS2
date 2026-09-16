# Script para obter e partilhar automaticamente o link do Cloudflare Tunnel
$logPath = Join-Path $env:TEMP "cloudflared.log"
$found = $false

for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 600
    if (Test-Path $logPath) {
        $content = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $url = $matches[0]
            Write-Host "  URL PARA AMIGOS -> " -NoNewline -ForegroundColor Gray
            Write-Host $url -ForegroundColor Cyan
            try {
                Set-Clipboard -Value $url -ErrorAction SilentlyContinue
                Write-Host "  [OK] Link copiado para a Area de Transferencia! (Ctrl+V)" -ForegroundColor Green
            } catch {}
            $found = $true
            break
        }
    }
}

if (-not $found) {
    Write-Host "  [!] A ligacao publica esta a demorar. Podes aceder localmente em http://localhost:5173" -ForegroundColor Yellow
}
