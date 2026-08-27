Add-Type -AssemblyName System.Drawing

function Create-AuraIcon($size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # 1. Background dark circle (matching favicon.svg #1a1a2e to #0d1118)
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 18, 22, 32))
    $g.FillEllipse($bgBrush, 0, 0, $size, $size)

    # Scale factor relative to 64x64 viewBox in favicon.svg
    $scale = $size / 64.0

    # 2. Orange headphones accent (#f27d11)
    $accentColor = [System.Drawing.Color]::FromArgb(255, 242, 125, 17)
    $accentPen = New-Object System.Drawing.Pen($accentColor, [Math]::Max(1.0, 3.5 * $scale))
    $accentPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $accentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    # Headphones arc
    $arcX = 16.0 * $scale
    $arcY = 16.0 * $scale
    $arcW = 32.0 * $scale
    $arcH = 36.0 * $scale
    $g.DrawArc($accentPen, [float]$arcX, [float]$arcY, [float]$arcW, [float]$arcH, 180, 180)

    # Ear cups: rects at x=12, y=33, w=8, h=13
    $accentBrush = New-Object System.Drawing.SolidBrush($accentColor)
    $g.FillRectangle($accentBrush, [float](12 * $scale), [float](33 * $scale), [float](8 * $scale), [float](13 * $scale))
    $g.FillRectangle($accentBrush, [float](44 * $scale), [float](33 * $scale), [float](8 * $scale), [float](13 * $scale))

    $accentBrush.Dispose()
    $accentPen.Dispose()
    $bgBrush.Dispose()
    $g.Dispose()

    return $bmp
}

$iconsDir = "src-tauri/icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

$bmp32 = Create-AuraIcon 32
$bmp32.Save("$iconsDir/32x32.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp32.Dispose()

$bmp128 = Create-AuraIcon 128
$bmp128.Save("$iconsDir/128x128.png", [System.Drawing.Imaging.ImageFormat]::Png)

$bmp256 = Create-AuraIcon 256
$bmp256.Save("$iconsDir/128x128@2x.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp256.Save("$iconsDir/icon.icns", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp256.Dispose()

# Create 32-bit PNG-embedded ICO file
$ms = New-Object System.IO.MemoryStream
$bmp128.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$ms.Dispose()
$bmp128.Dispose()

$icoStream = [System.IO.File]::Create("$iconsDir/icon.ico")
$bw = New-Object System.IO.BinaryWriter($icoStream)

$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]1)

$bw.Write([byte]128)
$bw.Write([byte]128)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([uint16]1)
$bw.Write([uint16]32)
$bw.Write([uint32]$pngBytes.Length)
$bw.Write([uint32]22)

$bw.Write($pngBytes)

$bw.Close()
$icoStream.Close()

Write-Host "Aura Favicon icon set generated successfully!"
