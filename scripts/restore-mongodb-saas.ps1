# Restore MongoDB multitenant SaaS platform into peaklogic-cloud from _extract-10c archive,
# then re-apply est-pc runtime + camera modules.
param(
  [string]$ArchiveRoot = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '_extract-10c\peaklogic-cloud'),
  [string]$CloudRoot = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'peaklogic-cloud'),
  [string]$EstRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ArchiveRoot)) { throw "Archive not found: $ArchiveRoot" }
if (-not (Test-Path $CloudRoot)) { throw "Cloud root not found: $CloudRoot" }

Write-Host "Restoring MongoDB SaaS platform" -ForegroundColor Cyan
Write-Host "  archive: $ArchiveRoot"
Write-Host "  cloud:   $CloudRoot"

function Copy-Tree {
  param([string]$Root, [string]$Rel)
  $src = Join-Path $Root $Rel
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing path: $Rel"
    return
  }
  $dest = Join-Path $CloudRoot $Rel
  $parent = Split-Path $dest -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  robocopy $src $dest /E /R:1 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy $Rel failed with exit code $LASTEXITCODE" }
  Write-Host "  restored: $Rel/" -ForegroundColor Green
}

function Copy-One {
  param([string]$Root, [string]$Rel, [string]$Label = 'restored')
  $src = Join-Path $Root $Rel
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing file: $Rel"
    return
  }
  $dest = Join-Path $CloudRoot $Rel
  $parent = Split-Path $dest -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Copy-Item $src $dest -Force
  Write-Host "  ${Label}: $Rel" -ForegroundColor $(if ($Label -eq 'merged') { 'Yellow' } else { 'Green' })
}

foreach ($dir in @(
  'src\db', 'src\services', 'src\auth', 'src\ingest', 'src\connectivity', 'src\mail', 'src\sms',
  'src\web', 'src\archive', 'src\cellular', 'src\cmms', 'src\util'
)) {
  Copy-Tree $ArchiveRoot $dir
}

Copy-One $ArchiveRoot 'src\api\routes\cloudStudioUsers.js'
Copy-One $ArchiveRoot 'src\configStore.js'
Copy-One $ArchiveRoot 'src\loadEnv.js'
Copy-One $ArchiveRoot 'src\server.js'
Copy-One $ArchiveRoot 'src\api\cloudApp.js'
Copy-One $ArchiveRoot 'DEPLOY.md'
Copy-One $ArchiveRoot '.env.example'

foreach ($route in @(
  'admin.js', 'adminWeb.js', 'auth.js', 'appliance.js', 'cmms.js', 'cmmsWeb.js', 'connectivityBilling.js',
  'devices.js', 'fleet.js', 'fleetWeb.js', 'ingest.js', 'installManifest.js', 'installWeb.js',
  'locations.js', 'locationSystems.js', 'projectHub.js', 'studio.js', 'systems.js', 'teamWeb.js',
  'users.js', 'web.js', 'sitesWeb.js'
)) {
  Copy-One $ArchiveRoot "src\routes\$route"
}

foreach ($viewDir in @('admin', 'cmms', 'sites', 'team', 'fleet', 'install', 'partials')) {
  Copy-Tree $ArchiveRoot "views\$viewDir"
}

foreach ($view in @(
  'login.ejs', 'forgot-password.ejs', 'reset-password.ejs', 'accept-invite.ejs',
  'public-home.ejs', 'cloud-home.ejs', 'layout.ejs', 'scada-dashboard.ejs'
)) {
  Copy-One $ArchiveRoot "views\$view"
}

Copy-Tree $EstRoot 'src\cameras'
foreach ($file in @(
  'src\cloud\agentHub.js', 'src\cloud\siteAgent.js', 'src\cloud\siteStore.js', 'src\cloud\agentProtocol.js',
  'src\api\routes\cloudSites.js', 'src\api\routes\cameras.js',
  'src\routes\cloudStudioPages.js',
  'views\cloud-studio.ejs',
  'public\js\hmi.js', 'public\js\api.js', 'public\js\cameraAdminUi.js',
  'public\js\hmiSetupUi.js', 'public\js\cloudStudioUi.js'
)) {
  Copy-One $EstRoot $file 'merged'
}

# SaaS entry + systemd + package identity (Mongo scripts/deps)
$saasPkg = Join-Path $CloudRoot 'package.json'
if (Test-Path $saasPkg) {
  $pkg = Get-Content $saasPkg -Raw | ConvertFrom-Json
  $pkg.main = 'src/server.js'
  if (-not $pkg.scripts) { $pkg | Add-Member -NotePropertyName scripts -NotePropertyValue (@{}) }
  $pkg.scripts.start = 'node src/server.js'
  $pkg.scripts.'start:runtime' = 'node server.js'
  if (-not $pkg.scripts.seed) { $pkg.scripts.seed = 'node scripts/seed.js' }
  if (-not $pkg.scripts.migrate) { $pkg.scripts.migrate = 'node src/db/indexes.js' }
  if (-not $pkg.scripts.indexes) { $pkg.scripts.indexes = 'node src/db/indexes.js' }
  $pkg | ConvertTo-Json -Depth 10 | Set-Content $saasPkg -Encoding UTF8
  Write-Host '  patched: package.json -> src/server.js entry' -ForegroundColor Green
  Push-Location $CloudRoot
  try {
    npm install --package-lock-only 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm install --package-lock-only failed with exit code $LASTEXITCODE" }
    Write-Host '  patched: package-lock.json (Mongo SaaS deps)' -ForegroundColor Green
  } finally {
    Pop-Location
  }
}

$svcPath = Join-Path $CloudRoot 'deploy\cloud\debian\peaklogic-saas.service'
if (Test-Path $svcPath) {
  $svc = Get-Content $svcPath -Raw
  if ($svc -match 'ExecStart=/usr/bin/node server\.js') {
    $svc = $svc -replace 'ExecStart=/usr/bin/node server\.js', 'ExecStart=/usr/bin/node src/server.js'
    Set-Content $svcPath $svc -Encoding UTF8 -NoNewline
    Write-Host '  patched: peaklogic-saas.service -> src/server.js' -ForegroundColor Green
  }
}

Write-Host "`nMongoDB SaaS platform restore complete." -ForegroundColor Green
