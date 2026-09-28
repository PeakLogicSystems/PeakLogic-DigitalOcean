# Build peaklogic-cloud-YYYYMMDD.tgz — full Cloud Studio for droplet (WinSCP).
# Port 3100 / peaklogic-saas: ST, projects, HMI, drivers + sites/remote cameras.
param(
  [string]$EstRoot = (Split-Path $PSScriptRoot -Parent),
  [string]$CloudRoot = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'peaklogic-cloud'),
  [string]$OutputDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'),
  [string]$BundleName = '',
  [switch]$SkipSync
)

$ErrorActionPreference = 'Stop'
$ExcludeFile = Join-Path $EstRoot 'deploy/cloud/debian/rsync-exclude.txt'
$InstallTxt = Join-Path $EstRoot 'deploy/cloud/debian/INSTALL.txt'

if (-not (Test-Path $EstRoot)) { throw "est-pc not found at $EstRoot" }

if (-not $SkipSync) {
  Write-Host "Syncing full Cloud Studio into peaklogic-cloud..." -ForegroundColor Cyan
  & (Join-Path $EstRoot 'scripts/sync-runtime-to-cloud.ps1') -CloudRoot $CloudRoot
}

if (-not (Test-Path $CloudRoot)) { throw "peaklogic-cloud not found at $CloudRoot" }
if (-not (Test-Path (Join-Path $CloudRoot 'server.js'))) { throw "Missing server.js" }
if (-not (Test-Path (Join-Path $CloudRoot 'views\dashboard.ejs'))) { throw "Missing dashboard (full Studio)" }
if (-not (Test-Path (Join-Path $CloudRoot 'src\api\cloudApp.js'))) {
  throw "Missing cloudApp.js (SaaS detect / sites APIs)"
}

# Preserve older SaaS/fleet entry (createCloudApp). Only write Studio stub when missing.
$srcServerPath = Join-Path $CloudRoot 'src\server.js'
$existingSrcServer = ''
if (Test-Path $srcServerPath) {
  $existingSrcServer = Get-Content -Path $srcServerPath -Raw -ErrorAction SilentlyContinue
}
if ($existingSrcServer -notmatch 'createCloudApp') {
  $srcServer = @"
'use strict';
process.env.PEAKLOGIC_DEPLOYMENT = process.env.PEAKLOGIC_DEPLOYMENT || 'cloud';
process.env.PEAKLOGIC_PRODUCT = process.env.PEAKLOGIC_PRODUCT || 'mvp-suite';
if (!process.env.PORT && !process.env.PEAKLOGIC_PORT) { process.env.PORT = '3100'; }
require('../server.js');
"@
  Set-Content -Path $srcServerPath -Value $srcServer -Encoding UTF8
} else {
  Write-Host 'Keeping SaaS/fleet src/server.js (createCloudApp)' -ForegroundColor Green
}

if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

if (-not $BundleName) {
  $BundleName = "peaklogic-cloud-$(Get-Date -Format 'yyyyMMdd').tgz"
}
$BundlePath = Join-Path $OutputDir $BundleName
$ManifestPath = [System.IO.Path]::ChangeExtension($BundlePath, '.txt')

Get-ChildItem $CloudRoot -Recurse -File -Include '*.sh', '*.service' -ErrorAction SilentlyContinue | ForEach-Object {
  $raw = [System.IO.File]::ReadAllText($_.FullName)
  if ($raw -match "`r") {
    $fixed = $raw -replace "`r`n", "`n" -replace "`r", "`n"
    [System.IO.File]::WriteAllText($_.FullName, $fixed)
  }
}

$stageParent = Join-Path $env:TEMP "peaklogic-bundle-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$stageRoot = Join-Path $stageParent 'peaklogic-cloud'
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

$excludeDirs = @('node_modules', '.git', 'dist', 'test', 'fork-manifests', 'product-templates', 'data')
$excludeFiles = @('.env', 'saas.env', '.fork-origin')
if (Test-Path $ExcludeFile) {
  Get-Content $ExcludeFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or $line.StartsWith('!')) { return }
    if ($line.EndsWith('/')) {
      $excludeDirs += ($line.TrimEnd('/'))
    } elseif ($line -match '\*') {
      # skip
    } else {
      $excludeFiles += $line
    }
  }
}

$robocopyArgs = @(
  $CloudRoot, $stageRoot,
  '/MIR', '/R:1', '/W:2',
  '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np',
  '/XD') + $excludeDirs + @('/XF') + $excludeFiles

& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy staging failed with exit code $LASTEXITCODE" }

$projectsSrc = Join-Path $CloudRoot 'data/projects'
$projectsDest = Join-Path $stageRoot 'data/projects'
if (Test-Path $projectsSrc) {
  if (-not (Test-Path (Join-Path $stageRoot 'data'))) {
    New-Item -ItemType Directory -Path (Join-Path $stageRoot 'data') -Force | Out-Null
  }
  robocopy $projectsSrc $projectsDest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
}

# Prefer peaklogic-cloud deploy when packing older SaaS/fleet (src/server.js createCloudApp).
# Only fall back to est-pc deploy for missing files.
$debianCloud = Join-Path $CloudRoot 'deploy\cloud\debian'
$debianEst = Join-Path $EstRoot 'deploy\cloud\debian'
$debianDest = Join-Path $stageRoot 'deploy\cloud\debian'
if (-not (Test-Path $debianDest)) { New-Item -ItemType Directory -Path $debianDest -Force | Out-Null }
$saasEntry = Get-Content -Path (Join-Path $CloudRoot 'src\server.js') -Raw -ErrorAction SilentlyContinue
$preferCloudDeploy = $saasEntry -match 'createCloudApp'
foreach ($f in @(
  'install-saas.sh', 'saas.env.example', 'peaklogic-saas.service',
  'nginx-peaklogic-saas.conf', 'mosquitto-debian.conf', 'INSTALL.txt', 'rsync-exclude.txt',
  '.env.saas.debian.example', 'INSTALL-SAAS.txt'
)) {
  $cloudFile = Join-Path $debianCloud $f
  $estFile = Join-Path $debianEst $f
  if ($preferCloudDeploy -and (Test-Path $cloudFile)) {
    Copy-Item $cloudFile (Join-Path $debianDest $f) -Force
  } elseif (Test-Path $estFile) {
    Copy-Item $estFile (Join-Path $debianDest $f) -Force
  } elseif (Test-Path $cloudFile) {
    Copy-Item $cloudFile (Join-Path $debianDest $f) -Force
  }
}
if (-not $preferCloudDeploy -and (Test-Path $InstallTxt)) {
  Copy-Item $InstallTxt (Join-Path $debianDest 'INSTALL.txt') -Force
}

foreach ($must in @('server.js', 'views\dashboard.ejs', 'src\server.js', 'src\api\cloudApp.js', 'deploy\cloud\debian\install-saas.sh')) {
  if (-not (Test-Path (Join-Path $stageRoot $must))) {
    throw "Bundle staging missing: $must"
  }
}

if (Test-Path $BundlePath) { Remove-Item $BundlePath -Force }

Push-Location $stageParent
try {
  & tar -czf $BundlePath peaklogic-cloud
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
  Remove-Item $stageParent -Recurse -Force -ErrorAction SilentlyContinue
}

$sizeMb = [math]::Round((Get-Item $BundlePath).Length / 1MB, 1)
$entryMode = if ($preferCloudDeploy) { 'MongoDB multitenant SaaS (createCloudApp)' } else { 'Hybrid Studio runtime (server.js stub)' }
$manifest = @"
PeakLogic Cloud SaaS droplet bundle
Built: $(Get-Date -Format o)
Archive: $BundleName
Size: $sizeMb MB
Source: $CloudRoot
Mode: $entryMode

Includes:
  - MongoDB multitenant platform: login, Sites, fleet, Team, CMMS, Studio
  - Entry: node src/server.js (createCloudApp) on port 3100
  - Remote cameras / site agent hub APIs (HMI iframe + cloud player)
  - install-saas.sh -> peaklogic-saas.service (ExecStart=src/server.js)

WinSCP: upload to /tmp/, then:
  mkdir -p /home/peaklogic
  tar xzf /tmp/$BundleName -C /home/peaklogic --strip-components=1
  sed -i 's/\r$//' /home/peaklogic/deploy/cloud/debian/install-saas.sh
  PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash /home/peaklogic/deploy/cloud/debian/install-saas.sh
  curl -s http://127.0.0.1:3100/health
  # open https://peaklogic.io/  (nginx -> :3100) — expect /login Bootstrap shell
"@
Set-Content -Path $ManifestPath -Value $manifest -Encoding UTF8

Write-Host "`nCloud Studio bundle ready:" -ForegroundColor Green
Write-Host "  $BundlePath"
Write-Host "  $sizeMb MB"
Write-Host "  $ManifestPath"
