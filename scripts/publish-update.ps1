# One-command dev publish: test est-pc, sync cloud, push both repos to GitHub.
# Replaces WinSCP — servers pull with deploy/update-from-github.sh
param(
  [string]$EstRoot = (Split-Path $PSScriptRoot -Parent),
  [string]$CloudRoot = (Join-Path (Split-Path $EstRoot -Parent) 'peaklogic-cloud'),
  [string]$EstRemote = 'origin',
  [string]$CloudRemote = 'origin',
  [string]$Branch = '',
  [switch]$SkipTest,
  [switch]$SkipCloudSync,
  [switch]$SkipPush,
  [switch]$DryRun,
  [string[]]$RemoteUpdate = @()
)

$ErrorActionPreference = 'Stop'

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Host "`n=== $label ===" -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "[dry-run] $($action.ToString())" -ForegroundColor DarkGray
    return
  }
  & $action
}

if ($Branch) {
  $estBranch = $Branch
} else {
  $estBranch = git -C $EstRoot branch --show-current 2>$null
  if (-not $estBranch) { $estBranch = 'main' }
}

Invoke-Step 'Test est-pc' {
  if ($SkipTest) {
    Write-Host 'Skipped (-SkipTest)'
    return
  }
  Push-Location $EstRoot
  try { npm test } finally { Pop-Location }
}

Invoke-Step 'Sync est-pc → peaklogic-cloud' {
  if ($SkipCloudSync) {
    Write-Host 'Skipped (-SkipCloudSync)'
    return
  }
  if (-not (Test-Path $CloudRoot)) {
    throw "peaklogic-cloud not found at $CloudRoot"
  }
  & (Join-Path $PSScriptRoot 'sync-runtime-to-cloud.ps1') -CloudRoot $CloudRoot
}

Invoke-Step 'Push est-pc' {
  if ($SkipPush) {
    Write-Host 'Skipped (-SkipPush)'
    return
  }
  git -C $EstRoot push $EstRemote $estBranch
}

Invoke-Step 'Push peaklogic-cloud' {
  if ($SkipPush -or $SkipCloudSync) {
    Write-Host 'Skipped'
    return
  }
  $cloudBranch = git -C $CloudRoot branch --show-current 2>$null
  if (-not $cloudBranch) { $cloudBranch = 'main' }
  git -C $CloudRoot push $CloudRemote $cloudBranch
}

foreach ($host in $RemoteUpdate) {
  Invoke-Step "Remote update: $host" {
    ssh $host 'sudo bash /home/peaklogic/deploy/update-from-github.sh'
  }
}

Write-Host ''
Write-Host 'Published. On targets (no WinSCP):' -ForegroundColor Green
Write-Host '  Cloud:     ssh root@<droplet> sudo bash /home/peaklogic/deploy/update-from-github.sh'
Write-Host '  IOT-LINK:  ssh root@<gateway>  sudo PEAKLOGIC_INSTALL_DIR=/opt/peaklogic bash /opt/peaklogic/deploy/update-from-github.sh'
Write-Host '  Or tag a release and use: sudo bash deploy/update-from-github.sh --release v<version>'
Write-Host ''
Write-Host 'See docs/UPDATES.md'
