param([Parameter(Mandatory)][string]$Receipt)
$ErrorActionPreference = 'Stop'
$receiptPath = (Resolve-Path -LiteralPath $Receipt).Path
$review = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
if ('e2eVariables' -notin $review.PSObject.Properties.Name -or @($review.e2eVariables).Count -ne 0) {
    throw 'Owner review requires a receipt proving no FOCUS_NOTES_E2E* variables.'
}
$app = Get-Process -Id $review.pid
$candidate = Split-Path -Parent $receiptPath
if ($app.Path -ne (Join-Path $candidate 'electron.exe')) { throw 'Receipt does not identify this candidate Electron.' }
$remaining = 21 - ((Get-Date) - $app.StartTime).TotalSeconds
if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int][Math]::Ceiling($remaining * 1000)) }
$app = Get-Process -Id $review.pid
$handle = $app.MainWindowHandle
if ($handle -eq 0 -or [string]::IsNullOrWhiteSpace($app.MainWindowTitle)) { throw 'No titled owner review window after 20 seconds.' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ReviewExposure {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(Point point, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flag);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] public static extern bool GetLayeredWindowAttributes(IntPtr hwnd, out uint key, out byte alpha, out uint flags);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, uint attr, out int value, uint size);
}
'@
if (![ReviewExposure]::IsWindowVisible($handle) -or [ReviewExposure]::IsIconic($handle)) { throw 'Owner review is hidden or minimized.' }
$cloaked = 0
if ([ReviewExposure]::DwmGetWindowAttribute($handle, 14, [ref]$cloaked, 4) -ne 0 -or $cloaked -ne 0) { throw 'Owner review is cloaked or its exposure cannot be checked.' }
if (([ReviewExposure]::GetWindowLong($handle, -20) -band 0x80000) -ne 0) {
    [uint32]$key = 0; [byte]$alpha = 0; [uint32]$flags = 0
    if (![ReviewExposure]::GetLayeredWindowAttributes($handle, [ref]$key, [ref]$alpha, [ref]$flags)) { throw 'Cannot verify layered-window opacity.' }
    if (($flags -band 2) -ne 0 -and $alpha -eq 0) { throw 'Owner review has zero opacity.' }
}
$rect = New-Object ReviewExposure+Rect
if (![ReviewExposure]::GetWindowRect($handle, [ref]$rect) -or $rect.Right -le $rect.Left -or $rect.Bottom -le $rect.Top) { throw 'Owner review has no usable bounds.' }
$exposed = 0
for ($row = 1; $row -le 5; $row++) {
    for ($column = 1; $column -le 9; $column++) {
        $point = New-Object ReviewExposure+Point
        $point.X = $rect.Left + [int](($rect.Right - $rect.Left) * $column / 10)
        $point.Y = $rect.Top + [int](($rect.Bottom - $rect.Top) * $row / 6)
        if ([ReviewExposure]::MonitorFromPoint($point, 0) -eq [IntPtr]::Zero) { continue }
        $hit = [ReviewExposure]::WindowFromPoint($point)
        if ($hit -ne [IntPtr]::Zero -and [ReviewExposure]::GetAncestor($hit, 2) -eq $handle) { $exposed++ }
    }
}
if ($exposed -eq 0) { throw 'Owner review is not exposed on screen (covered or off-screen); do not report it launched.' }
if ((Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json).pid -ne $review.pid) { throw 'Review receipt changed during verification.' }
$evidence = [ordered]@{
    pid = $review.pid; title = $app.MainWindowTitle; handle = $handle.ToInt64()
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    aliveSeconds = ((Get-Date) - $app.StartTime).TotalSeconds
    exposedPoints = $exposed; sampledPoints = 45
    bounds = @($rect.Left, $rect.Top, $rect.Right, $rect.Bottom)
}
$evidence | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $candidate "owner-review-verified-$($review.pid).json")
Write-Output "Verified exposed owner review: $($app.MainWindowTitle), PID $($review.pid), $exposed/45 interior points."
