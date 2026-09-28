# Upload peaklogic-cloud-*.tgz to a droplet via scp (Windows-friendly).
param(
  [string]$DropletHost = 'root@206.189.198.96',
  [string]$RemotePath = '/tmp/',
  [string]$BundlePath = '',
  [string]$SshKey = '',
  [switch]$SkipSshTest
)

$ErrorActionPreference = 'Stop'
$EstRoot = Split-Path $PSScriptRoot -Parent
$DistDir = Join-Path $EstRoot 'dist'

if (-not $BundlePath) {
  $latest = @(
    Get-ChildItem $DistDir -Filter 'peaklogic-saas-*.tgz' -ErrorAction SilentlyContinue
    Get-ChildItem $DistDir -Filter 'peaklogic-cloud-*.tgz' -ErrorAction SilentlyContinue
  ) | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) {
    throw "No bundle in $DistDir - run: powershell -File scripts\create-saas-bundle.ps1"
  }
  $BundlePath = $latest.FullName
}

if (-not (Test-Path $BundlePath)) {
  throw "Bundle not found: $BundlePath"
}

$sizeMb = [math]::Round((Get-Item $BundlePath).Length / 1MB, 1)
Write-Host ("Bundle: {0} ({1} MB)" -f $BundlePath, $sizeMb) -ForegroundColor Cyan
Write-Host ("Target: {0}:{1}" -f $DropletHost, $RemotePath) -ForegroundColor Cyan

$sshArgs = @('-o', 'ConnectTimeout=15', '-o', 'BatchMode=no')
if ($SshKey) {
  if (-not (Test-Path $SshKey)) { throw "SSH key not found: $SshKey" }
  $sshArgs += @('-i', $SshKey)
  Write-Host "SSH key: $SshKey" -ForegroundColor Cyan
}

if (-not $SkipSshTest) {
  Write-Host 'Testing SSH (15s timeout)...' -ForegroundColor Yellow
  Write-Host 'If this hangs, press Ctrl+C - you may need -SshKey or password auth.' -ForegroundColor Yellow
  & ssh @sshArgs $DropletHost 'echo SSH_OK; hostname'
  if ($LASTEXITCODE -ne 0) {
    throw "SSH failed. Try: ssh $($sshArgs -join ' ') $DropletHost"
  }
}

$remote = if ($RemotePath.EndsWith('/')) {
  "{0}:{1}{2}" -f $DropletHost, $RemotePath, (Split-Path $BundlePath -Leaf)
} else {
  "{0}:{1}" -f $DropletHost, $RemotePath
}

Write-Host ("Uploading (verbose - may take 1-3 min for {0} MB)..." -f $sizeMb) -ForegroundColor Green
& scp -v -C @sshArgs $BundlePath $remote
if ($LASTEXITCODE -ne 0) {
  throw "scp failed with exit code $LASTEXITCODE"
}

Write-Host ''
Write-Host 'Upload complete.' -ForegroundColor Green
$leaf = Split-Path $BundlePath -Leaf
Write-Host "  ssh $DropletHost"
Write-Host '  mkdir -p /home/peaklogic'
Write-Host "  tar xzf /tmp/$leaf -C /home/peaklogic --strip-components=1"
if ($leaf -match 'peaklogic-saas') {
  Write-Host '  sudo PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash /home/peaklogic/deploy/cloud/debian/install-saas.sh'
  Write-Host "  sudo -u peaklogic bash -lc 'cd /home/peaklogic && npm run seed'"
} else {
  Write-Host '  sudo PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash /home/peaklogic/deploy/cloud/debian/install.sh'
  Write-Host "  sudo -u peaklogic bash -lc 'cd /home/peaklogic && npm run seed:bundled-projects'"
}
