# Build peaklogic-cloud-YYYYMMDDd.tgz — est-pc Cloud SaaS droplet bundle (WinSCP / DO).
param(
  [string]$EstRoot = (Split-Path $PSScriptRoot -Parent),
  [string]$OutputDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'),
  [string]$BundleName = '',
  [string]$Suffix = 'd'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $EstRoot 'server.js'))) {
  throw "est-pc server.js not found at $EstRoot"
}

if (-not $BundleName) {
  $BundleName = "peaklogic-cloud-$(Get-Date -Format 'yyyyMMdd')$Suffix.tgz"
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

$stageParent = Join-Path $env:TEMP "peaklogic-saas-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$stageRoot = Join-Path $stageParent 'peaklogic'
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

$excludeDirs = @(
  'node_modules', '.git', 'dist', 'test', 'fork-manifests', 'product-templates',
  'cellular-opta-gateway', 'native', 'azure', '.github', 'build', 'sim-studies'
)
$excludeFiles = @('.env', 'saas.env', '.fork-origin', 'peaklogic.pid')

$robocopyArgs = @(
  $EstRoot, $stageRoot,
  '/MIR', '/R:1', '/W:2',
  '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np',
  '/XD') + $excludeDirs + @('/XF') + $excludeFiles

& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy staging failed with exit code $LASTEXITCODE" }

foreach ($must in @('server.js', 'views\dashboard.ejs', 'deploy\cloud\debian\install-saas.sh', 'scripts\start-saas.js', 'scripts\seed-saas.js')) {
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
PeakLogic Cloud SaaS droplet bundle
Built: $(Get-Date -Format o)
Archive: $BundleName
Size: $sizeMb MB
Source: $EstRoot
Mode: est-pc unified cloud SaaS (PEAKLOGIC_DEPLOYMENT=cloud, port 3100)

Includes:
  - Multi-tenant login, Sites, fleet, People, CMMS, full Studio
  - Entry: node scripts/start-saas.js on port 3100 (peaklogic-saas.service)
  - Do NOT use install.sh (3090 hub) — use install-saas.sh only
  - Remote cameras / site agent hub APIs
  - install-saas.sh + npm run seed (demo org)
  - 16 bundled demo projects (data/projects/*.est.zip)

WinSCP: upload to /tmp/, then:
  mkdir -p /home/peaklogic
  tar xzf /tmp/$BundleName -C /home/peaklogic --strip-components=1
  sed -i 's/\r$//' /home/peaklogic/deploy/cloud/debian/install-saas.sh
  PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash /home/peaklogic/deploy/cloud/debian/install-saas.sh
  sudo -u peaklogic bash -lc 'cd /home/peaklogic && npm run seed'
  curl -s http://127.0.0.1:3100/health
  # open https://your.domain/login  (nginx -> :3100)

Phase 1 (SaaS + archive): scripts\create-phase1-bundles.ps1
Docs: docs/CLOUD_DEPLOY_DO_PHASE1.md, deploy/cloud/phase1/WINSCP-DEPLOY.md
"@
Set-Content -Path $ManifestPath -Value $manifest -Encoding UTF8

Write-Host "`nCloud bundle ready:" -ForegroundColor Green
Write-Host "  $BundlePath"
Write-Host "  $sizeMb MB"
Write-Host "  $ManifestPath"
