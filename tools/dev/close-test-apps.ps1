# Closes the Focus Notes instances that local work left open: Electron apps started by journeys,
# benches or `pnpm dev` from this repository and its worktrees (focus-notes-work\worktrees, D-227),
# and candidate previews (focus-notes-work\preview\candidates).
# Never touches the owner's Preview (focus-notes-work\preview\builds), any other project's Electron,
# an app whose profile (--user-data-dir) is under a scratch\owner-review\ folder (the owner's review
# apps, unless -IncludeOwnerReview), or a process in -KeepPid, its children or the app it belongs to.
# Run after every local run that starts the app, and before opening a candidate preview (AGENTS.md).
# -WhatIf lists what would close and what is kept, and closes nothing.
[CmdletBinding(PositionalBinding = $false)]
param(
  # Keep this candidate preview open (the one the owner is testing), by its commit.
  [string]$KeepCandidate,
  # Never touch these processes, their children, or the app a kept helper belongs to.
  [string[]]$KeepPid = @(),
  # Close only these processes or the apps started under them (a builder's own runs).
  [string[]]$OnlyPid = @(),
  # Also close the owner's review apps (profiles under scratch\owner-review\). Only when the owner asks.
  [switch]$IncludeOwnerReview,
  [switch]$WhatIf
)
# Accept 1,2 or "1 2" too: `pwsh -File` passes a list as one string.
function ConvertTo-Pids([string[]]$list) { @($list -split '[,\s]+' | Where-Object { $_ } | ForEach-Object { [int]$_ }) }
$keepIds = ConvertTo-Pids $KeepPid
$onlyIds = ConvertTo-Pids $OnlyPid
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$sideProjects = if ($repo -match '^(.*)\\focus-notes-work\\') { $Matches[1] } else { Split-Path $repo -Parent }
$side = [regex]::Escape($sideProjects)
$ours = '^' + $side + '\\(focus-notes|focus-notes-work\\worktrees\\[^\\]+)\\.*\\electron\\dist\\electron\.exe$'
$candidates = '^' + $side + '\\focus-notes-work\\preview\\candidates\\([^\\]+)\\focus-notes\.exe$'
$ownerReview = '--user-data-dir="?[^"]*\\scratch\\owner-review\\'

$all = @(Get-CimInstance Win32_Process)
$parentOf = @{}
$childrenOf = @{}
foreach ($p in $all) {
  $parentOf[[int]$p.ProcessId] = [int]$p.ParentProcessId
  if (-not $childrenOf.ContainsKey([int]$p.ParentProcessId)) { $childrenOf[[int]$p.ParentProcessId] = @() }
  $childrenOf[[int]$p.ParentProcessId] += $p
}
function Get-Descendants([int]$id) {
  $seen = @{}; $queue = [System.Collections.Generic.Queue[int]]::new(); $queue.Enqueue($id)
  while ($queue.Count) {
    $cur = $queue.Dequeue()
    foreach ($c in @($childrenOf[$cur])) {
      if (-not $c) { continue }
      $cid = [int]$c.ProcessId
      if ($cid -eq $id -or $seen.ContainsKey($cid)) { continue }
      $seen[$cid] = $c; $queue.Enqueue($cid)
    }
  }
  $seen.Values
}
function Get-Ancestors([int]$id) {
  $seen = @{}; $cur = $id
  while ($parentOf.ContainsKey($cur) -and -not $seen.ContainsKey($cur)) {
    $seen[$cur] = $true; $cur = $parentOf[$cur]; if ($cur -le 0) { break }
    $cur
  }
}

$closed = 0
foreach ($p in $all | Where-Object { $_.Name -eq 'electron.exe' -or $_.Name -eq 'focus-notes.exe' }) {
  # Only main processes: their helpers exit with them.
  if ($p.CommandLine -match '--type=') { continue }
  $path = $p.ExecutablePath
  if (-not $path) { continue }
  $kind = $null
  if ($path -match $ours) { $kind = 'test' }
  elseif ($path -match $candidates -and $Matches[1] -ne $KeepCandidate) { $kind = "candidate $($Matches[1])" }
  if (-not $kind) { continue }
  $id = [int]$p.ProcessId
  if ($onlyIds.Count -and -not ($onlyIds | Where-Object { (@($id) + @(Get-Ancestors $id)) -contains $_ })) { continue }
  $tree = @(Get-Descendants $id)
  $line = "$kind (pid $id)"
  # The main process may get its profile from FOCUS_NOTES_USER_DATA, so its helpers' flags count too.
  if (-not $IncludeOwnerReview -and (@($p) + $tree | Where-Object { $_.CommandLine -match $ownerReview })) {
    "kept ${line}: owner review profile"; continue
  }
  $related = @($id) + @($tree | ForEach-Object { [int]$_.ProcessId }) + @(Get-Ancestors $id)
  if ($keepIds | Where-Object { $related -contains $_ }) { "kept ${line}: -KeepPid"; continue }
  if ($WhatIf) { "would close $line"; continue }
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  "closed $line"
  $closed++
}
"$closed instance(s) closed."
