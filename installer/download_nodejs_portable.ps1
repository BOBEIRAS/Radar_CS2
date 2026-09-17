# Download portable Node.js LTS for Windows x64 (no install needed)
$ErrorActionPreference = 'Stop'

Write-Host "Fetching latest Node.js LTS version..."
$index = Invoke-WebRequest -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing | ConvertFrom-Json
$lts   = $index | Where-Object { $_.lts } | Select-Object -First 1
if (-not $lts) {
    throw "Could not find a Node.js LTS release in the Node.js index."
}

$ver   = $lts.version
$zipUrl = "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip"
$zipPath = "$PSScriptRoot\nodejs_portable.zip"
$outDir  = "$PSScriptRoot\nodejs_portable"

Write-Host "Downloading Node.js $ver (portable zip)..."
Write-Host "URL: $zipUrl"
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting..."
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
if (Test-Path "$PSScriptRoot\_node_tmp") { Remove-Item "$PSScriptRoot\_node_tmp" -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath "$PSScriptRoot\_node_tmp" -Force

# Move the inner folder (node-vX.Y.Z-win-x64) to nodejs_portable
$inner = Get-ChildItem "$PSScriptRoot\_node_tmp" | Select-Object -First 1
if (-not $inner) {
    throw "Downloaded archive did not contain a Node.js folder."
}

Move-Item $inner.FullName $outDir
Remove-Item "$PSScriptRoot\_node_tmp" -Recurse -Force
Remove-Item $zipPath -Force

$sizeMB = [math]::Round((Get-ChildItem $outDir -Recurse | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "Done! Portable Node.js at: $outDir"
Write-Host "Size: $sizeMB MB"
Write-Host "node.exe: $(Test-Path "$outDir\node.exe")"
Write-Host "npm: $(Test-Path "$outDir\npm.cmd")"
