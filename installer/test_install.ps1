$app = 'C:\Users\andre\AppData\Local\CS2WebRadar'
$pass = 0; $fail = 0

function Test($name, $value) {
    if ($value) { Write-Host "[PASS] $name" -ForegroundColor Green; $script:pass++ }
    else        { Write-Host "[FAIL] $name" -ForegroundColor Red;   $script:fail++ }
}

Test "StartRadar.bat installed"      (Test-Path "$app\StartRadar.bat")
Test "usermode.exe installed"        (Test-Path "$app\usermode\release\usermode.exe")
Test "node_modules installed"        (Test-Path "$app\webapp\node_modules")
Test "config.json installed"         (Test-Path "$app\config.json")
Test "offsets.json installed"        (Test-Path "$app\offsets.json")
Test "tunnel.ps1 installed"          (Test-Path "$app\scripts\tunnel.ps1")
Test "Node.js bundled MSI present"   (Test-Path "$app\installer\nodejs_lts_x64.msi")
Test "Desktop shortcut created"      (Test-Path "$env:USERPROFILE\Desktop\CS2 Web Radar.lnk")
Test "Start Menu shortcut created"   (Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\CS2 Web Radar\CS2 Web Radar.lnk")
Test "Uninstaller present"           (Test-Path "$app\unins000.exe")
Test "node.exe on PATH"              ($null -ne (Get-Command node -ErrorAction SilentlyContinue))
Test "npm on PATH"                   ($null -ne (Get-Command npm -ErrorAction SilentlyContinue))

# Bat syntax check
$batContent = Get-Content "$app\StartRadar.bat" -Raw -ErrorAction SilentlyContinue
Test "bat has CRLF endings"          ($batContent -match "`r`n")
Test "bat contains ROOT_DIR"         ($batContent -match "ROOT_DIR")
Test "bat contains npm install"      ($batContent -match "npm install")
Test "bat contains cloudflared"      ($batContent -match "cloudflared")
Test "bat contains usermode.exe"     ($batContent -match "usermode.exe")

# node_modules package count
$pkgCount = (Get-ChildItem "$app\webapp\node_modules" -ErrorAction SilentlyContinue | Measure-Object).Count
Test "node_modules has packages (>50)" ($pkgCount -gt 50)
Write-Host "   (found $pkgCount packages)"

Write-Host ""
Write-Host "=================================="
Write-Host "  PASSED: $pass  |  FAILED: $fail"
Write-Host "=================================="
