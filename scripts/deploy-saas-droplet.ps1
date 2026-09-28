# Upload SaaS bundle to peaklogic.io droplet and restart peaklogic-saas (code-only update).
param(
  [string]$DropletHost = 'mv-saas',
  [string]$BundlePath = '',
  [string]$SshKey = "$env:USERPROFILE\.ssh\id_ed25519_peaklogic",
  [string]$RemoteInstall = '/home/peaklogic',
  [switch]$SkipBuild,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$EstRoot = Split-Path $PSScriptRoot -Parent
$DistDir = Join-Path $EstRoot 'dist'

if (-not $SkipBuild) {
  Write-Host 'Building SaaS bundle...' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'create-saas-bundle.ps1')
}

if (-not $BundlePath) {
  $latest = Get-ChildItem $DistDir -Filter 'peaklogic-cloud-*.tgz' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) { throw "No bundle in $DistDir - run create-saas-bundle.ps1" }
  $BundlePath = $latest.FullName
}
if (-not (Test-Path $BundlePath)) { throw "Bundle not found: $BundlePath" }

$leaf = Split-Path $BundlePath -Leaf
$sizeMb = [math]::Round((Get-Item $BundlePath).Length / 1MB, 1)
Write-Host "Bundle: $BundlePath (${sizeMb} MB)" -ForegroundColor Cyan
Write-Host "Target: $DropletHost ($RemoteInstall)" -ForegroundColor Cyan

$sshArgs = @('-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new')
if ($SshKey) {
  if (-not (Test-Path $SshKey)) { throw "SSH key not found: $SshKey" }
  $sshArgs += @('-i', $SshKey)
}

$remoteScript = @'
set -euo pipefail
BUNDLE="/tmp/__LEAF__"
INSTALL="__INSTALL__"
echo "[deploy] stopping peaklogic-saas..."
systemctl stop peaklogic-saas 2>/dev/null || true
echo "[deploy] extracting bundle..."
mkdir -p "$INSTALL"
tar xzf "$BUNDLE" -C "$INSTALL" --strip-components=1
find "$INSTALL/deploy" -type f \( -name '*.sh' -o -name '*.service' \) -exec sed -i 's/\r$//' {} + 2>/dev/null || true
chown -R peaklogic:peaklogic "$INSTALL"
echo "[deploy] npm ci..."
sudo -u peaklogic env HOME=/var/lib/peaklogic bash -lc "cd '$INSTALL' && npm ci --omit=dev"
echo "[deploy] seed tenant project libraries..."
sudo -u peaklogic env HOME=/var/lib/peaklogic PEAKLOGIC_DEPLOYMENT=cloud bash -lc "cd '$INSTALL' && node scripts/seed-tenant-projects.js" || true
echo "[deploy] patch live workspace screen_2 to DUPLEXLS if needed..."
for WS in "/var/lib/peaklogic/workspace.est.json" "$INSTALL/data/workspace.est.json"; do
  if [ -f "$WS" ]; then
    sudo -u peaklogic env HOME=/var/lib/peaklogic bash -lc "cd '$INSTALL' && node scripts/duplex-lift-station/patch-screen2-duplexls.js '$WS'" || true
  fi
done
echo "[deploy] ensure Circle K duplex-100 library project..."
sudo -u peaklogic env HOME=/var/lib/peaklogic bash -lc "cd '$INSTALL' && node scripts/circlek-fleet/generate-artifacts.js --duplex-100" || true
echo "[deploy] point MQTT Parc hub at mv-mqtt (mqtt.peaklogic.io)..."
bash "$INSTALL/deploy/cloud/phase1/remote-fix-saas-mqtt-hub.sh" || true
echo "[deploy] starting peaklogic-saas..."
systemctl start peaklogic-saas
sleep 2
echo "[deploy] verify peaklogic-saas..."
systemctl is-active peaklogic-saas
curl -fsS http://127.0.0.1:3100/health 2>/dev/null | head -c 200 || true
echo
echo "[deploy] done - hard-refresh https://peaklogic.io/login"
'@ -replace '__LEAF__', $leaf -replace '__INSTALL__', $RemoteInstall

if ($DryRun) {
  Write-Host '[dry-run] scp + ssh remote update' -ForegroundColor Yellow
  Write-Host $remoteScript
  return
}

Write-Host 'Uploading bundle (may take 2-5 min)...' -ForegroundColor Green
& scp -C @sshArgs $BundlePath "${DropletHost}:/tmp/"
if ($LASTEXITCODE -ne 0) { throw "scp failed - check key at $SshKey and host alias $DropletHost" }

Write-Host 'Applying on droplet...' -ForegroundColor Green
$remoteScript = ($remoteScript -replace "`r", '')
$remoteScript | & ssh @sshArgs $DropletHost 'bash -s'
if ($LASTEXITCODE -ne 0) { throw 'Remote deploy failed' }

Write-Host 'Cloud deploy complete.' -ForegroundColor Green
