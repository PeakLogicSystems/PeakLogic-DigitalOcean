# Generate mooreview-mvp-suite, mooreview-st-mvp, mooreview-client, mooreview-cloud from est-pc.
param(
  [string[]]$Products = @('mvp-suite', 'st-mvp', 'client', 'cloud'),
  [switch]$SkipHmiAssets,
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$BaseRoot = Split-Path $PSScriptRoot -Parent
$ParentDir = Split-Path $BaseRoot -Parent
$ManifestDir = Join-Path $BaseRoot 'fork-manifests'
$TemplateRoot = Join-Path $BaseRoot 'product-templates'

$ManifestMap = @{
  'mvp-suite' = 'mvp-suite.json'
  'st-mvp'    = 'st-mvp.json'
  'client'    = 'mv-client.json'
  'cloud'     = 'cloud-server.json'
}

function Convert-GlobToRegex([string]$glob) {
  $g = $glob -replace '\\', '/'
  $esc = [regex]::Escape($g)
  $esc = $esc -replace '\\\*\\\*', '.*'
  $esc = $esc -replace '\\\*', '[^/]*'
  return "^$esc$"
}

function Test-ExcludedPath([string]$relPath, [string[]]$patterns) {
  $p = $relPath -replace '\\', '/'
  foreach ($pat in $patterns) {
    $re = Convert-GlobToRegex $pat
    if ($p -match $re) { return $true }
  }
  return $false
}

function Copy-ProductTree {
  param(
    [string]$TargetRoot,
    [object]$Manifest
  )
  $exclude = @($Manifest.excludeGlobs)
  if ($SkipHmiAssets) {
    $exclude += 'public/hmi/svg/library/**'
  }

  foreach ($rel in $Manifest.includeDirs) {
    $src = Join-Path $BaseRoot $rel
    if (-not (Test-Path $src)) {
      Write-Warning "Skip missing: $rel"
      continue
    }
    $dest = Join-Path $TargetRoot $rel
    $parent = Split-Path $dest -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -Path $src -Destination $dest -Recurse -Force
  }

  foreach ($rel in $Manifest.includeFiles) {
    $src = Join-Path $BaseRoot $rel
    if (-not (Test-Path $src)) { continue }
    $dest = Join-Path $TargetRoot $rel
    $parent = Split-Path $dest -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -Path $src -Destination $dest -Force
  }

  Get-ChildItem -Path $TargetRoot -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if (-not $_.PSIsContainer) {
      $rel = $_.FullName.Substring($TargetRoot.Length).TrimStart('\', '/')
      if (Test-ExcludedPath $rel $exclude) {
        Remove-Item $_.FullName -Force
      }
    }
  }

  Get-ChildItem -Path $TargetRoot -Recurse -Directory -Force -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
      if ((Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
      }
    }
}

function Apply-ProductTemplate {
  param([string]$TargetRoot, [string]$TemplateName)
  $tpl = Join-Path $TemplateRoot $TemplateName
  if (-not (Test-Path $tpl)) { throw "Missing template: $tpl" }
  Copy-Item -Path (Join-Path $tpl '*') -Destination $TargetRoot -Recurse -Force
}

function Patch-ClientDashboard([string]$TargetRoot, [string]$ApiBase) {
  $dash = Join-Path $TargetRoot 'views\dashboard.ejs'
  if (-not (Test-Path $dash)) { return }
  $content = Get-Content $dash -Raw -Encoding UTF8
  $inject = @"
<script>window.MOOREVIEW_API_BASE = '<%= typeof mooreviewApiBase !== "undefined" ? mooreviewApiBase : "" %>';</script>
  <script src="/js/api-config.js"></script>
  <script src="/js/api.js"></script>
"@
  if ($content -notmatch 'api-config\.js') {
    $content = $content -replace '<script src="/js/api\.js"></script>', $inject
    Set-Content -Path $dash -Value $content -Encoding UTF8 -NoNewline
  }
}

function Write-ProductMarker([string]$TargetRoot, [string]$Product) {
  $marker = @"
# Generated product fork — do not edit est-pc base here.
# Regenerate: cd est-pc && powershell -File scripts/create-product-forks.ps1 -Products $Product
# Docs: est-pc/docs/PRODUCT_FORKS.md
generatedAt: $(Get-Date -Format o)
product: $Product
base: est-pc
"@
  Set-Content -Path (Join-Path $TargetRoot '.fork-origin') -Value $marker -Encoding UTF8
}

Write-Host "Base: $BaseRoot"
Write-Host "Output parent: $ParentDir"

foreach ($key in $Products) {
  if (-not $ManifestMap.ContainsKey($key)) {
    throw "Unknown product '$key'. Use: mvp-suite, st-mvp, client, cloud"
  }
  $manifestPath = Join-Path $ManifestDir $ManifestMap[$key]
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  $target = Join-Path $ParentDir $manifest.name

  Write-Host "`n=== $($manifest.name) ===" -ForegroundColor Cyan
  if ($Clean -and (Test-Path $target)) {
    Remove-Item $target -Recurse -Force
  }
  if (-not (Test-Path $target)) {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
  }

  Copy-ProductTree -TargetRoot $target -Manifest $manifest
  Apply-ProductTemplate -TargetRoot $target -TemplateName $manifest.productTemplate

  if ($key -eq 'client') {
    Patch-ClientDashboard -TargetRoot $target -ApiBase ''
    $pages = Join-Path $target 'src\routes\pages.js'
    if (Test-Path $pages) {
      $pc = Get-Content $pages -Raw
      if ($pc -notmatch 'mooreviewApiBase') {
        $pc = $pc -replace "res\.render\('dashboard', \{([^}]+)\}\)", "res.render('dashboard', {`$1, mooreviewApiBase: res.app.locals.mooreviewApiBase || '' })"
        Set-Content $pages $pc -Encoding UTF8 -NoNewline
      }
    }
  }

  Write-ProductMarker -TargetRoot $target -Product $key
  Write-Host "Created: $target"
}

Write-Host "`nDone. Install each product: cd <dir> && npm install && npm start" -ForegroundColor Green
