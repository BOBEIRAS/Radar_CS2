## Download Node.js LTS MSI for bundling in installer
$indexUrl = 'https://nodejs.org/dist/index.json'
Write-Host "Fetching Node.js LTS version..."
$versions = Invoke-WebRequest -Uri $indexUrl -UseBasicParsing | ConvertFrom-Json
$lts = $versions | Where-Object { $_.lts } | Select-Object -First 1
$version = $lts.version
$msiUrl = "https://nodejs.org/dist/$version/node-$version-x64.msi"
$outPath = "$PSScriptRoot\nodejs_lts_x64.msi"

Write-Host "Downloading Node.js $version from: $msiUrl"
Invoke-WebRequest -Uri $msiUrl -OutFile $outPath -UseBasicParsing
Write-Host "Saved to: $outPath"
Write-Host "Size: $([math]::Round((Get-Item $outPath).Length/1MB,1)) MB"
