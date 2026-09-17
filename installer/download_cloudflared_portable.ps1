# Download cloudflared as a portable executable for Windows x64 (no install needed).
$ErrorActionPreference = 'Stop'

$url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
$outPath = Join-Path $PSScriptRoot 'cloudflared.exe'

Write-Host "Downloading cloudflared portable..."
Write-Host "URL: $url"
Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing

$sizeMB = [math]::Round((Get-Item $outPath).Length / 1MB, 1)
Write-Host "Done! cloudflared.exe saved to: $outPath"
Write-Host "Size: $sizeMB MB"
