# Sync est-pc Studio runtime into peaklogic-cloud without wiping MongoDB SaaS platform files.
# Preserves createCloudApp entry (src/server.js), platform routes/services/db, and Mongo cloudSites auth.
param(
  [string]$CloudRoot = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'peaklogic-cloud')
)

$ErrorActionPreference = 'Stop'
$RepoParent = Split-Path $CloudRoot -Parent
$EstRoot = Join-Path $RepoParent 'est-pc'

if (-not (Test-Path $EstRoot)) { throw "est-pc not found at $EstRoot" }
if (-not (Test-Path $CloudRoot)) {
  New-Item -ItemType Directory -Path $CloudRoot -Force | Out-Null
}

function Test-SaasPlatform {
  param([string]$Root)
  $srcServer = Join-Path $Root 'src\server.js'
  if (-not (Test-Path $srcServer)) { return $false }
  $text = Get-Content $srcServer -Raw -ErrorAction SilentlyContinue
  return ($text -match 'createCloudApp')
}

$isSaas = Test-SaasPlatform $CloudRoot
if ($isSaas) {
  Write-Host "Detected MongoDB SaaS platform (createCloudApp) — preserving platform files" -ForegroundColor Yellow
}

Write-Host "Sync Studio runtime -> peaklogic-cloud (SaaS on :3100)" -ForegroundColor Cyan
Write-Host "  from: $EstRoot"
Write-Host "  to:   $CloudRoot"

function Sync-Tree {
  param([string]$Rel)
  $src = Join-Path $EstRoot $Rel
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing: $Rel"
    return
  }
  $dest = Join-Path $CloudRoot $Rel
  $parent = Split-Path $dest -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  robocopy $src $dest /MIR /R:1 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy $Rel failed with exit code $LASTEXITCODE" }
  Write-Host "  sync: $Rel/" -ForegroundColor Green
}

function Sync-SrcRuntime {
  $src = Join-Path $EstRoot 'src'
  $dest = Join-Path $CloudRoot 'src'
  if (-not (Test-Path $src)) { throw "Missing est-pc src/" }

  $excludeDirs = @()
  $excludeFiles = @()
  if ($isSaas) {
    $excludeDirs = @(
      'db', 'services', 'auth', 'ingest', 'connectivity', 'mail', 'sms', 'web',
      'archive', 'cellular', 'cmms', 'util', 'messaging', 'product', 'routes'
    ) | ForEach-Object { Join-Path $src $_ }
    $excludeFiles = @(
      (Join-Path $src 'server.js'),
      (Join-Path $src 'loadEnv.js'),
      (Join-Path $src 'configStore.js'),
      (Join-Path $src 'api\cloudApp.js')
    )
  }

  $args = @($src, $dest, '/MIR', '/R:1', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np')
  if ($excludeDirs.Count) { $args += '/XD'; $args += $excludeDirs }
  if ($excludeFiles.Count) { $args += '/XF'; $args += $excludeFiles }

  & robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy src failed with exit code $LASTEXITCODE" }
  Write-Host '  sync: src/ (runtime; platform dirs excluded)' -ForegroundColor Green

  if ($isSaas) {
    foreach ($routeFile in @('cloudStudioPages.js', 'nextcenturyPortal.js', 'pages.js', 'staticAssets.js')) {
      $from = Join-Path $EstRoot "src\routes\$routeFile"
      if (Test-Path $from) {
        Copy-Item $from (Join-Path $CloudRoot "src\routes\$routeFile") -Force
      }
    }
    Write-Host '  sync: src/routes/ (Studio pages only)' -ForegroundColor Green

    $cloudSitesDest = Join-Path $CloudRoot 'src\api\routes\cloudSites.js'
    $cloudSitesSrc = Join-Path $EstRoot 'src\api\routes\cloudSites.js'
    $keepMongoAuth = $false
    if (Test-Path $cloudSitesDest) {
      $existing = Get-Content $cloudSitesDest -Raw
      $keepMongoAuth = ($existing -match "require\('../../auth/middleware'\)")
    }
    if ($keepMongoAuth) {
      Write-Host '  keep: src/api/routes/cloudSites.js (Mongo auth)' -ForegroundColor Yellow
    } elseif (Test-Path $cloudSitesSrc) {
      Copy-Item $cloudSitesSrc $cloudSitesDest -Force
      Write-Host '  sync: src/api/routes/cloudSites.js' -ForegroundColor Green
    }
  }
}

foreach ($dir in @('public', 'views', 'st', 'firmware', 'config', 'docs')) {
  Sync-Tree $dir
}
Sync-SrcRuntime

# Bundled Studio project snapshots (seeded into Mongo via npm run seed:bundled-projects)
$estProjects = Join-Path $EstRoot 'data/projects'
$cloudProjects = Join-Path $CloudRoot 'data/projects'
if (Test-Path $estProjects) {
  if (-not (Test-Path $cloudProjects)) { New-Item -ItemType Directory -Path $cloudProjects -Force | Out-Null }
  Copy-Item (Join-Path $estProjects '*.est.json') $cloudProjects -Force
  $n = (Get-ChildItem $cloudProjects -Filter '*.est.json' -ErrorAction SilentlyContinue).Count
  Write-Host "  sync: data/projects/ ($n snapshots)" -ForegroundColor Green
}

$estMvDraw = Join-Path $EstRoot 'mv-draw'
$cloudMvDraw = Join-Path $CloudRoot 'mv-draw'
if (Test-Path $estMvDraw) {
  if (Test-Path $cloudMvDraw) { Remove-Item $cloudMvDraw -Recurse -Force }
  Copy-Item $estMvDraw $cloudMvDraw -Recurse -Force
  Write-Host '  sync: mv-draw/' -ForegroundColor Green
}

# Root appliance server for npm run start:runtime — never replace SaaS src/server.js or lock file
foreach ($file in @('server.js', 'README.md')) {
  $src = Join-Path $EstRoot $file
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $CloudRoot $file) -Force
    Write-Host "  sync: $file" -ForegroundColor Green
  }
}

if (-not $isSaas) {
  $lockSrc = Join-Path $EstRoot 'package-lock.json'
  if (Test-Path $lockSrc) {
    Copy-Item $lockSrc (Join-Path $CloudRoot 'package-lock.json') -Force
    Write-Host '  sync: package-lock.json (hybrid runtime)' -ForegroundColor Green
  }
} else {
  Write-Host '  keep: package-lock.json (Mongo SaaS deps)' -ForegroundColor Yellow
}

if (-not $isSaas) {
  $pkgSrc = Join-Path $EstRoot 'package.json'
  if (Test-Path $pkgSrc) {
    Copy-Item $pkgSrc (Join-Path $CloudRoot 'package.json') -Force
    Write-Host '  sync: package.json (hybrid runtime)' -ForegroundColor Green
  }
} else {
  Write-Host '  keep: package.json (Mongo SaaS scripts/deps)' -ForegroundColor Yellow
  Write-Host '  keep: src/server.js (createCloudApp)' -ForegroundColor Yellow
}

$estScripts = Join-Path $EstRoot 'scripts'
$cloudScripts = Join-Path $CloudRoot 'scripts'
if (Test-Path $estScripts) {
  if (-not (Test-Path $cloudScripts)) { New-Item -ItemType Directory -Path $cloudScripts -Force | Out-Null }
  Get-ChildItem $estScripts -File | ForEach-Object {
    if ($_.Name -eq 'seed.js') { return }
    Copy-Item $_.FullName (Join-Path $cloudScripts $_.Name) -Force
  }
  $estMvDrawScripts = Join-Path $estScripts 'mv-draw'
  if (Test-Path $estMvDrawScripts) {
    $dest = Join-Path $cloudScripts 'mv-draw'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Item $estMvDrawScripts $dest -Recurse -Force
  }
  Write-Host '  sync: scripts/' -ForegroundColor Green
}

$estDeploy = Join-Path $EstRoot 'deploy'
$cloudDeploy = Join-Path $CloudRoot 'deploy'
if (Test-Path $estDeploy) {
  if (-not (Test-Path $cloudDeploy)) { New-Item -ItemType Directory -Path $cloudDeploy -Force | Out-Null }
  if ($isSaas) {
    robocopy $estDeploy $cloudDeploy /E /XF peaklogic-saas.service /R:1 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  } else {
    robocopy $estDeploy $cloudDeploy /E /R:1 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  }
  if ($LASTEXITCODE -ge 8) { throw "robocopy deploy failed with exit code $LASTEXITCODE" }
  Write-Host '  sync: deploy/' -ForegroundColor Green
}

Write-Host "`nSync complete. SaaS entry: node src/server.js (createCloudApp) on :3100" -ForegroundColor Green
