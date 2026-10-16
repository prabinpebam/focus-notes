# Closes the Focus Notes instances that local work left open: Electron apps started by journeys,
# benches or `pnpm dev` from this repository and its worktrees, and candidate previews.
# Never touches the owner's Preview (focus-notes-preview\builds) or any other project's Electron.
# Run after every local run that starts the app, and before opening a candidate preview (AGENTS.md).
param(
  # Keep this candidate preview open (the one the owner is testing), by its commit.
  [string]$KeepCandidate,
  [switch]$WhatIf
)
$sideProjects = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$ours = '^' + [regex]::Escape($sideProjects) + '\\(focus-notes|fn-[^\\]+)\\.*\\electron\\dist\\electron\.exe$'
$candidates = '^' + [regex]::Escape($sideProjects) + '\\focus-notes-preview\\candidates\\([^\\]+)\\focus-notes\.exe$'
$closed = 0
foreach ($p in Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='focus-notes.exe'") {
  # Only main processes: their helpers exit with them.
  if ($p.CommandLine -match '--type=') { continue }
  $path = $p.ExecutablePath
  if (-not $path) { continue }
  $kind = $null
  if ($path -match $ours) { $kind = 'test' }
  elseif ($path -match $candidates -and $Matches[1] -ne $KeepCandidate) { $kind = "candidate $($Matches[1])" }
  if (-not $kind) { continue }
  if ($WhatIf) { "would close $kind (pid $($p.ProcessId))"; continue }
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  "closed $kind (pid $($p.ProcessId))"
  $closed++
}
"$closed instance(s) closed."
