# Push alarm-scope notification feature files to SaaS droplet (no full bundle).
param(
  [string]$DropletHost = 'mv-saas',
  [string]$ProxyJumpHost = '',
  [string]$SshKey = '',
  [string]$SshConfig = '',
  [string]$RemoteInstall = '/home/peaklogic',
  [string]$ServiceName = 'peaklogic-saas',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
if (-not $SshKey) {
  $SshKey = Join-Path $Root '.ssh\id_ed25519_peaklogic'
}
if (-not $SshConfig) {
  $SshConfig = Join-Path $Root '.ssh\config'
}
if (-not (Test-Path $SshKey)) { throw "SSH key not found: $SshKey" }
if (-not (Test-Path $SshConfig)) { throw "SSH config not found: $SshConfig" }

$sshArgs = @('-F', $SshConfig, '-o', 'ConnectTimeout=30', '-o', 'StrictHostKeyChecking=accept-new', '-i', $SshKey)
if ($ProxyJumpHost) {
  $sshArgs += @('-J', $ProxyJumpHost)
}

# Public SSH to SaaS is often firewalled; fall back to VPC jump via mv-mqtt.
if (-not $ProxyJumpHost -and $DropletHost -eq 'mv-saas') {
  $tcp = Test-NetConnection -ComputerName 159.223.154.210 -Port 22 -WarningAction SilentlyContinue
  if (-not $tcp.TcpTestSucceeded) {
    Write-Host 'Public SSH to mv-saas blocked; using mv-saas-vpc via mv-mqtt...' -ForegroundColor Yellow
    $DropletHost = 'mv-saas-vpc'
  }
}

$files = @(
  'src/users/userProfileSchema.js',
  'src/users/userStore.js',
  'src/users/alarmNotifier.js',
  'src/users/notificationScopeCatalog.js',
  'src/alarms/alarmContext.js',
  'src/services/authService.js',
  'src/tenants/tenantStore.js',
  'src/messaging/cloudServices.js',
  'src/messaging/workers.js',
  'src/integrations/cmmsAlarmPublisher.js',
  'src/api/routes/users.js',
  'src/api/routes/tenantAuth.js',
  'public/js/app.js',
  'public/js/api.js',
  'public/js/cloudStudioUi.js',
  'public/css/cloud-studio.css',
  'views/dashboard.ejs',
  'docs/ALARM_NOTIFICATIONS.md'
)

Write-Host "Alarm-scope incremental deploy -> $DropletHost`:$RemoteInstall" -ForegroundColor Cyan
foreach ($rel in $files) {
  $local = Join-Path $Root $rel
  if (-not (Test-Path $local)) { throw "Missing: $local" }
  $remote = "$RemoteInstall/$($rel -replace '\\','/')"
  $remoteDir = Split-Path $remote -Parent
  if ($DryRun) {
    Write-Host "[dry-run] scp $rel -> $remote"
    continue
  }
  & ssh @sshArgs $DropletHost "mkdir -p '$($remoteDir -replace '\\','/')'"
  & scp @sshArgs $local "${DropletHost}:$remote"
  if ($LASTEXITCODE -ne 0) { throw "scp failed: $rel" }
}

$remoteScript = @"
set -euo pipefail
chown -R peaklogic:peaklogic '$RemoteInstall/src' '$RemoteInstall/public' '$RemoteInstall/views' '$RemoteInstall/docs/ALARM_NOTIFICATIONS.md'
systemctl restart $ServiceName
sleep 2
systemctl is-active $ServiceName
curl -fsS http://127.0.0.1:3100/health | head -c 200 || true
echo
"@

if ($DryRun) {
  Write-Host '[dry-run] restart service'
  exit 0
}

Write-Host 'Restarting peaklogic-saas...' -ForegroundColor Green
$remoteScript = ($remoteScript -replace "`r", '')
$remoteScript | & ssh @sshArgs $DropletHost 'bash -s'
if ($LASTEXITCODE -ne 0) { throw 'Remote restart failed' }
Write-Host 'Alarm-scope deploy complete. Hard-refresh https://peaklogic.io/people' -ForegroundColor Green
