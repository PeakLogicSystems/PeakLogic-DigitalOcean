# Minimal connectivity patch (email/SMS + save) for cloud droplet WinSCP upload.
# Usage: powershell -File scripts/create-connectivity-patch.ps1
param(
  [string]$OutputDir = (Join-Path (Join-Path $PSScriptRoot '..') 'dist')
)

$ErrorActionPreference = 'Stop'
$CloudRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$PatchName = "connectivity-patch-$Stamp"
$StageRoot = Join-Path $OutputDir $PatchName

$Files = @(
  'views/cellular-sims.ejs',
  'public/js/cellularSimsPage.js',
  'public/js/api.js',
  'public/css/pc.css',
  'src/routes/studio.js',
  'src/routes/pages.js',
  'src/api/expressRouter.js',
  'src/api/routes/messaging.js',
  'src/messaging/setupStatus.js',
  'src/messaging/platformMessagingStore.js',
  'src/messaging/messagingSettings.js',
  'src/mail/mailConfig.js',
  'src/mail/mailer.js',
  'src/mail/sendGridApi.js',
  'src/sms/smsConfig.js',
  'src/sms/twilioSms.js',
  'deploy/cloud/debian/verify-connectivity-deploy.sh',
  'deploy/cloud/debian/apply-saas-upgrade.sh'
)

Write-Host "Connectivity patch -> $StageRoot" -ForegroundColor Cyan
if (Test-Path $StageRoot) { Remove-Item $StageRoot -Recurse -Force }
New-Item -ItemType Directory -Path $StageRoot -Force | Out-Null

foreach ($rel in $Files) {
  $src = Join-Path $CloudRoot $rel
  if (-not (Test-Path $src)) { throw "Missing $rel" }
  $dest = Join-Path $StageRoot $rel
  $parent = Split-Path $dest -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Copy-Item $src $dest -Force
}

Get-ChildItem $StageRoot -Recurse -File -Include *.sh | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
  [IO.File]::WriteAllText($_.FullName, $text)
}

@"
Connectivity patch ($Stamp)
=========================
Upload this ENTIRE folder into /home/peaklogic/ (merge/overwrite).

Then on droplet:
  sed -i 's/\r$//' /home/peaklogic/deploy/cloud/debian/*.sh
  sudo bash /home/peaklogic/deploy/cloud/debian/apply-saas-upgrade.sh
  sudo bash /home/peaklogic/deploy/cloud/debian/verify-connectivity-deploy.sh

Page check: title must be "Connectivity" and show "Alarm email" + "Alarm SMS" at top.
"@ | Set-Content (Join-Path $StageRoot 'README-UPLOAD.txt') -Encoding UTF8

$ArchivePath = Join-Path $OutputDir "$PatchName.tgz"
if (Test-Path $ArchivePath) { Remove-Item $ArchivePath -Force }
Push-Location $OutputDir
try { tar -czf $ArchivePath $PatchName } finally { Pop-Location }

Write-Host "Ready:" -ForegroundColor Green
Write-Host "  Folder:  $StageRoot"
Write-Host "  Archive: $ArchivePath"
