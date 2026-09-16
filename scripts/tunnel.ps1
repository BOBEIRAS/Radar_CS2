# CS2 Web Radar - Cloudflare Tunnel link extractor
# Waits for the tunnel to initialize and copies the public URL to the clipboard

$logPath = Join-Path $env:TEMP "cloudflared.log"
$found = $false

for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 600
    if (Test-Path $logPath) {
        $content = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $url = $matches[0]
            Write-Host "  Public URL -> " -NoNewline -ForegroundColor Gray
            Write-Host $url -ForegroundColor Cyan
            try {
                Set-Clipboard -Value $url -ErrorAction SilentlyContinue
                Write-Host "  [OK] Link copied to clipboard! (Ctrl+V to share)" -ForegroundColor Green
            } catch {}
            $found = $true
            break
        }
    }
}

if (-not $found) {
    Write-Host "  [!] Tunnel is still starting up. Access locally at http://localhost:5173" -ForegroundColor Yellow
    Write-Host "      The public link will appear in the cloudflared.exe window shortly." -ForegroundColor DarkYellow
}
