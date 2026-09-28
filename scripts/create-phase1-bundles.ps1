# Build both Phase 1 droplet bundles (SaaS + archive).
param(
  [string]$EstRoot = (Split-Path $PSScriptRoot -Parent),
  [string]$OutputDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'dist')
)

$ErrorActionPreference = 'Stop'
$date = Get-Date -Format 'yyyyMMdd'

Write-Host "=== Phase 1 bundle build ===" -ForegroundColor Cyan
Write-Host "Source: $EstRoot`n"

& (Join-Path $PSScriptRoot 'create-saas-bundle.ps1') -EstRoot $EstRoot -OutputDir $OutputDir -Suffix 'd'
& (Join-Path $PSScriptRoot 'create-archive-bundle.ps1') -EstRoot $EstRoot -OutputDir $OutputDir

$saas = Get-ChildItem (Join-Path $OutputDir "peaklogic-cloud-${date}d.tgz") -ErrorAction SilentlyContinue
$archive = Get-ChildItem (Join-Path $OutputDir "peaklogic-archive-${date}.tgz") -ErrorAction SilentlyContinue

Write-Host "`n=== Phase 1 bundles ready ===" -ForegroundColor Green
if ($saas) { Write-Host "  Cloud 1 (SaaS):    $($saas.FullName) ($([math]::Round($saas.Length/1MB,1)) MB)" }
if ($archive) { Write-Host "  Cloud 2 (archive): $($archive.FullName) ($([math]::Round($archive.Length/1MB,1)) MB)" }
Write-Host "`nNext: deploy/cloud/phase1/WINSCP-DEPLOY.md"
