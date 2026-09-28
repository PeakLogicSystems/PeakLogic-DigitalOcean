# Copy new bundled .est.zip demo projects to peaklogic.io and re-seed tenant libraries.
param(
  [string]$DropletHost = 'mv-saas',
  [string]$SshKey = "$env:USERPROFILE\.ssh\id_ed25519_peaklogic",
  [string]$RemoteInstall = '/home/peaklogic',
  [switch]$DryRun,
  [switch]$MissingOnly,
  [string[]]$ProjectIds = @()
)

$ErrorActionPreference = 'Stop'
$EstRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path $SshKey)) {
  $repoKey = Join-Path $EstRoot '.ssh\id_ed25519_peaklogic'
  if (Test-Path $repoKey) { $SshKey = $repoKey }
}
$sshConfig = Join-Path $EstRoot '.ssh\portable-deploy.config'
if (-not (Test-Path $sshConfig)) { $sshConfig = Join-Path $EstRoot '.ssh\config' }

Write-Host 'Packing bundled projects locally...' -ForegroundColor Cyan
Push-Location $EstRoot
try {
  node scripts/ensure-bundled-projects.js
  if ($LASTEXITCODE -ne 0) { throw 'ensure-bundled-projects failed' }
} finally {
  Pop-Location
}

$sshArgs = @('-F', $sshConfig, '-o', 'ConnectTimeout=30', '-o', 'StrictHostKeyChecking=accept-new')
if ($SshKey) {
  if (-not (Test-Path $SshKey)) { throw "SSH key not found: $SshKey" }
  $sshArgs += @('-i', $SshKey)
}

$allZips = Get-ChildItem (Join-Path $EstRoot 'data\projects') -Filter '*.est.zip' | Sort-Object Name
if (-not $allZips.Count) { throw 'No .est.zip files under data/projects' }

$zips = if ($ProjectIds.Count) {
  $allZips | Where-Object {
    $id = $_.BaseName -replace '\.est$',''
    $ProjectIds -contains $id
  }
} else { $allZips }

if ($MissingOnly) {
  Write-Host 'Checking remote for missing or stale project zips...' -ForegroundColor Cyan
  $remoteSizesRaw = & ssh @sshArgs $DropletHost "for f in '$RemoteInstall/data/projects/'*.est.zip; do [ -f \"\$f\" ] && stat -c '%s %n' \"\$f\"; done" 2>$null
  $remoteMap = @{}
  foreach ($line in ($remoteSizesRaw -split "`n")) {
    if ($line -match '^(\d+)\s+(.+)\\([^\\]+)$') {
      $remoteMap[$Matches[3]] = [int64]$Matches[1]
    }
  }
  $zips = @($zips | Where-Object {
    $name = $_.Name
    $localSize = $_.Length
    -not $remoteMap.ContainsKey($name) -or $remoteMap[$name] -ne $localSize
  })
  if (-not $zips.Count) {
    Write-Host 'No missing or stale library zips to upload.' -ForegroundColor Green
  } else {
    Write-Host "Will upload $($zips.Count) zip(s):" -ForegroundColor Cyan
    $zips | ForEach-Object { Write-Host "  $($_.Name) ($($_.Length) bytes)" }
  }
}

$stFiles = @(
  'st\logic\opta_split_hvac.st',
  'st\logic\opta_double_split_hvac.st'
) | ForEach-Object { Join-Path $EstRoot $_ } | Where-Object { Test-Path $_ }

Write-Host "Uploading $($zips.Count) bundled .est.zip file(s) to $DropletHost..." -ForegroundColor Cyan
$remoteProjects = "$RemoteInstall/data/projects"
$remoteBoilerplate = "$RemoteInstall/data/boilerplate/projects"
$remoteSt = "$RemoteInstall/st/logic"

if ($DryRun) {
  Write-Host "[dry-run] would upload:" -ForegroundColor Yellow
  $zips | ForEach-Object { Write-Host "  $($_.Name)" }
  $stFiles | ForEach-Object { Write-Host "  $(Split-Path $_ -Leaf)" }
  Write-Host "[dry-run] would sync stale tenant zips + run seed-tenant-projects.js on $DropletHost"
  return
}

if (-not $zips.Count) {
  $uploadZips = $false
} else {
  $uploadZips = $true
}

if ($uploadZips -or -not $MissingOnly) {
  & ssh @sshArgs $DropletHost "mkdir -p '$remoteProjects' '$remoteBoilerplate' '$remoteSt'"
  if ($LASTEXITCODE -ne 0) { throw "SSH to $DropletHost failed (exit $LASTEXITCODE)" }
}
if ($uploadZips) {
  & scp @sshArgs ($zips.FullName) "${DropletHost}:${remoteProjects}/"
  if ($LASTEXITCODE -ne 0) { throw "scp projects failed (exit $LASTEXITCODE)" }
  & scp @sshArgs ($zips.FullName) "${DropletHost}:${remoteBoilerplate}/"
  if ($LASTEXITCODE -ne 0) { throw "scp boilerplate failed (exit $LASTEXITCODE)" }
}
if ($stFiles.Count -and $uploadZips) {
  & scp @sshArgs $stFiles "${DropletHost}:${remoteSt}/"
  if ($LASTEXITCODE -ne 0) { throw "scp ST programs failed (exit $LASTEXITCODE)" }
}

$remote = @'
set -euo pipefail
LIB='__INSTALL__/data/boilerplate/projects'
for tid in __INSTALL__/data/tenants/*/projects; do
  [ -d "$tid" ] || continue
  for lib in "$LIB"/*.est.zip; do
    [ -f "$lib" ] || continue
    base=$(basename "$lib")
    dest="$tid/$base"
    if [ ! -f "$dest" ] || [ "$(stat -c '%s' "$lib")" != "$(stat -c '%s' "$dest" 2>/dev/null || echo 0)" ]; then
      cp -f "$lib" "$dest"
      echo "[sync] $dest"
    fi
  done
done
chown -R peaklogic:peaklogic __INSTALL__/data/projects __INSTALL__/data/boilerplate/projects __INSTALL__/data/tenants 2>/dev/null || true
sudo -u peaklogic env HOME=/var/lib/peaklogic PEAKLOGIC_DEPLOYMENT=cloud bash -lc "cd __INSTALL__ && node scripts/seed-tenant-projects.js"
echo '[push-bundled] tenant libraries updated'
find __INSTALL__/data/tenants -path '*/projects/*hvac*.est.zip' -print0 2>/dev/null | while IFS= read -r -d '' f; do stat -c '%s %n' "$f"; done
'@ -replace '__INSTALL__', $RemoteInstall

& ssh @sshArgs $DropletHost $remote
if ($LASTEXITCODE -ne 0) { throw "remote seed failed (exit $LASTEXITCODE)" }
Write-Host 'Done — hard-refresh Studio and open Project -> Open project.' -ForegroundColor Green
