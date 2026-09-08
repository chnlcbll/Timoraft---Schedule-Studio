Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-TimoraftIcon([int]$Size, [string]$Path) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $scale = $Size / 128.0

  $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#20211f'))
  $paper = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f2f0e9'))
  $paperSoft = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(180, 242, 240, 233))
  $blue = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#3158d4'))
  $rail = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(180, 242, 240, 233), [Math]::Max(1, 5 * $scale))
  $rail.StartCap = $rail.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $backgroundPath = New-RoundedRectPath 0 0 $Size $Size (28 * $scale)
  $graphics.FillPath($background, $backgroundPath)
  $graphics.DrawLine($rail, 38*$scale, 26*$scale, 38*$scale, 102*$scale)
  foreach ($cy in @(36, 64, 92)) {
    $graphics.FillEllipse($paper, 33*$scale, ($cy-5)*$scale, 10*$scale, 10*$scale)
  }

  $blueBlock = New-RoundedRectPath (51*$scale) (26*$scale) (53*$scale) (20*$scale) (7*$scale)
  $paperBlock = New-RoundedRectPath (51*$scale) (54*$scale) (38*$scale) (20*$scale) (7*$scale)
  $softBlock = New-RoundedRectPath (51*$scale) (82*$scale) (47*$scale) (20*$scale) (7*$scale)
  $graphics.FillPath($blue, $blueBlock)
  $graphics.FillPath($paper, $paperBlock)
  $graphics.FillPath($paperSoft, $softBlock)
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $softBlock.Dispose(); $paperBlock.Dispose(); $blueBlock.Dispose(); $backgroundPath.Dispose()
  $rail.Dispose(); $blue.Dispose(); $paperSoft.Dispose(); $paper.Dispose(); $background.Dispose()
  $graphics.Dispose(); $bitmap.Dispose()
}

$icons = Join-Path $PSScriptRoot '..\extension\icons'
New-TimoraftIcon 16 (Join-Path $icons 'icon16.png')
New-TimoraftIcon 48 (Join-Path $icons 'icon48.png')
New-TimoraftIcon 128 (Join-Path $icons 'icon128.png')
