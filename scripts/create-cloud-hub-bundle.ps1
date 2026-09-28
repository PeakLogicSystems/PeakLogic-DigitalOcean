# Build peaklogic-cloud-hub-YYYYMMDD.tgz — est-pc cloud VM (port 3090, not multi-tenant SaaS).
param(
  [string]$EstRoot = (Split-Path $PSScriptRoot -Parent),
  [string]$OutputDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'),
  [string]$BundleName = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $EstRoot 'server.js'))) {
  throw "est-pc server.js not found at $EstRoot"
}

if (-not $BundleName) {
  $BundleName = "peaklogic-cloud-hub-$(Get-Date -Format 'yyyyMMdd').tgz"
}
$BundlePath = Join-Path $OutputDir $BundleName
$ManifestPath = [System.IO.Path]::ChangeExtension($BundlePath, '.txt')

if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

Write-Host "Ensuring bundled .est.zip projects..." -ForegroundColor Cyan
Push-Location $EstRoot
try {
  node scripts/ensure-bundled-projects.js
  if ($LASTEXITCODE -ne 0) { throw 'ensure-bundled-projects failed' }
} finally {
  Pop-Location
}

$stageParent = Join-Path $env:TEMP "peaklogic-cloud-hub-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$stageRoot = Join-Path $stageParent 'peaklogic'
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

$excludeDirs = @('node_modules', '.git', 'dist', 'test', 'fork-manifests', 'product-templates', 'cellular-opta-gateway', 'native', 'azure')
$excludeFiles = @('.env', 'saas.env', '.fork-origin')

$robocopyArgs = @(
  $EstRoot, $stageRoot,
  '/MIR', '/R:1', '/W:2',
  '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np',
  '/XD') + $excludeDirs + @('/XF') + $excludeFiles

& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy staging failed with exit code $LASTEXITCODE" }

foreach ($must in @(
  'server.js',
  'views\dashboard.ejs',
  'deploy\cloud\debian\install.sh',
  'deploy\cloud\debian\peaklogic.service',
  'scripts\start-cloud.js'
)) {
  if (-not (Test-Path (Join-Path $stageRoot $must))) {
    throw "Bundle staging missing: $must"
  }
}

Get-ChildItem (Join-Path $stageRoot 'deploy\cloud\debian') -File -Include '*.sh', '*.service' -ErrorAction SilentlyContinue | ForEach-Object {
  $raw = [System.IO.File]::ReadAllText($_.FullName)
  if ($raw -match "`r") {
    [System.IO.File]::WriteAllText($_.FullName, ($raw -replace "`r`n", "`n" -replace "`r", "`n"))
  }
}

if (Test-Path $BundlePath) { Remove-Item $BundlePath -Force }

Push-Location $stageParent
try {
  & tar -czf $BundlePath peaklogic
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
  Remove-Item $stageParent -Recurse -Force -ErrorAction SilentlyContinue
}

$sizeMb = [math]::Round((Get-Item $BundlePath).Length / 1MB, 1)
$manifest = @"
PeakLogic Cloud Hub droplet bundle (est-pc, non-SaaS)
Built: $(Get-Date -Format o)
Archive: $BundleName
Size: $sizeMb MB
Source: $EstRoot

Mode: PEAKLOGIC_DEPLOYMENT=cloud, port 3090 — full Studio + MQTT Parc hub + cloud/cellular sims.
Not multi-tenant SaaS (no /login org flow on 3100). Use install-saas bundle for SaaS.

WinSCP: upload to /tmp/, then on droplet:

  mkdir -p /home/peaklogic
  tar xzf /tmp/$BundleName -C /home/peaklogic --strip-components=1
  nano /etc/peaklogic/env
  PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash /home/peaklogic/deploy/cloud/debian/install.sh
  curl -s http://127.0.0.1:3090/health

Bundled projects: data/projects/*.est.zip (16 demos)
Docs: deploy/cloud/debian/README-debian.md
"@
Set-Content -Path $ManifestPath -Value $manifest -Encoding UTF8

Write-Host "`nCloud hub bundle ready:" -ForegroundColor Green
Write-Host "  $BundlePath"
Write-Host "  $sizeMb MB"
Write-Host "  $ManifestPath"
