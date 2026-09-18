Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\andre\.gemini\antigravity-ide\brain\1f8eb958-c68d-4178-97bb-b427d9020379\cs2radar_icon_1789600708829.jpg'
$icoPath = 'd:\cs2_webradar\installer\icon.ico'

$srcImg = [System.Drawing.Image]::FromFile($srcPath)

# Create multiple sizes for the ICO (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)

$ms = New-Object System.IO.MemoryStream

# ICO header: reserved(2) + type(2) + count(2)
$count = $sizes.Count
$headerSize = 6
$dirSize = 16 * $count  # 16 bytes per directory entry
$offset = $headerSize + $dirSize

# Write ICO header
$header = [byte[]]@(0,0, 1,0, [byte]$count, 0)
$ms.Write($header, 0, $header.Length)

$imageData = @()
foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($srcImg, 0, 0, $size, $size)
    $g.Dispose()
    
    $imgMs = New-Object System.IO.MemoryStream
    $bmp.Save($imgMs, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $imgData = $imgMs.ToArray()
    $imgMs.Dispose()
    $imageData += , $imgData
}

# Write directory entries
foreach ($i in 0..($count-1)) {
    $size = $sizes[$i]
    $dataLen = $imageData[$i].Length
    $w = if ($size -eq 256) { 0 } else { [byte]$size }
    $h = if ($size -eq 256) { 0 } else { [byte]$size }
    
    # width(1) height(1) colorcount(1) reserved(1) planes(2) bitcount(2) size(4) offset(4)
    $entry = [byte[]]@($w, $h, 0, 0, 1, 0, 32, 0)
    $ms.Write($entry, 0, $entry.Length)
    
    $sizeBytes = [System.BitConverter]::GetBytes([uint32]$dataLen)
    $ms.Write($sizeBytes, 0, 4)
    
    $offsetBytes = [System.BitConverter]::GetBytes([uint32]$offset)
    $ms.Write($offsetBytes, 0, 4)
    
    $offset += $dataLen
}

# Write image data
foreach ($data in $imageData) {
    $ms.Write($data, 0, $data.Length)
}

[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$ms.Dispose()
$srcImg.Dispose()

Write-Host "ICO created: $icoPath ($([System.IO.FileInfo]::new($icoPath).Length) bytes)"
