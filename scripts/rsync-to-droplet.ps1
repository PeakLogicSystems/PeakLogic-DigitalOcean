# Transfer peaklogic-cloud to a Debian droplet at /home/peaklogic (rsync over SSH).
# Run from est-pc after sync-runtime-to-cloud.ps1 has updated peaklogic-cloud.
param(
  [Parameter(Mandatory = $true)]
  [string]$DropletHost,

  [string]$CloudRoot = '',
  [string]$RemotePath = '/home/peaklogic',
  [switch]$SkipSync,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$EstRoot = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { Split-Path (Get-Location) -Parent }
if (-not $CloudRoot) {
  $CloudRoot = Join-Path (Split-Path $EstRoot -Parent) 'peaklogic-cloud'
}
$ExcludeFile = Join-Path $EstRoot 'deploy/cloud/debian/rsync-exclude.txt'

if (-not $SkipSync) {
  Write-Host 'Syncing est-pc runtime into peaklogic-cloud…' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'sync-runtime-to-cloud.ps1') -CloudRoot $CloudRoot
}

if (-not (Test-Path $CloudRoot)) {
  throw "peaklogic-cloud not found at $CloudRoot"
}
if (-not (Test-Path (Join-Path $CloudRoot 'server.js'))) {
  throw "Runtime entry server.js missing in $CloudRoot - run sync-runtime-to-cloud.ps1 first"
}
if (-not (Test-Path (Join-Path $CloudRoot 'deploy/cloud/debian/install.sh'))) {
  throw "deploy/cloud/debian/install.sh missing - run sync-runtime-to-cloud.ps1 first"
}
if (-not (Test-Path $ExcludeFile)) {
  throw "Exclude file missing: $ExcludeFile"
}

$rsync = Get-Command rsync -ErrorAction SilentlyContinue
if (-not $rsync) {
  throw @"
rsync not found in PATH. Install one of:
  - WSL: wsl rsync ...
  - Git for Windows (add Git\usr\bin to PATH)
  - cwRsync / MSYS2

Or transfer manually (from peaklogic-cloud):
  rsync -avz --delete --exclude-from=../est-pc/deploy/cloud/debian/rsync-exclude.txt ./ ${DropletHost}:${RemotePath}/
"@
}

$remote = "${DropletHost}:${RemotePath}/"
$dry = if ($DryRun) { @('--dry-run') } else { @() }

Write-Host "Source:  $CloudRoot"
Write-Host "Target:  $remote"
Write-Host "Exclude: $ExcludeFile"

& rsync @dry -avz --delete `
  --exclude-from="$ExcludeFile" `
  -e ssh `
  "$CloudRoot/" `
  $remote

$estProjects = Join-Path $EstRoot 'data/projects'
if (Test-Path $estProjects) {
  Write-Host 'Syncing bundled project snapshots…' -ForegroundColor Cyan
  & rsync @dry -avz `
    -e ssh `
    "$estProjects/" `
    "${remote}data/projects/"
}

Write-Host ''
Write-Host 'Transfer complete. On the droplet:' -ForegroundColor Cyan
Write-Host "  ssh $DropletHost"
Write-Host "  sudo PEAKLOGIC_SOURCE=$RemotePath PEAKLOGIC_INSTALL_DIR=$RemotePath bash $RemotePath/deploy/cloud/debian/install.sh"
Write-Host "  sudo -u peaklogic bash -lc 'cd $RemotePath && npm run seed:bundled-projects'"
