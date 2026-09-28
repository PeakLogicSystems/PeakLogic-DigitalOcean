# PeakLogic Phase 1 ATL (atl1) — automated upload + remote install
# After DO resources exist and phase1-atl.local.env is filled:
#   npm run deploy:phase1-atl
#
# See deploy/cloud/phase1/DEPLOY-ATL-MQTT-AUTOMATED.md
param(
  [string]$ConfigPath = '',
  [string]$SshKey = '',
  [switch]$SkipBuild,
  [switch]$SkipUpload,
  [switch]$UploadOnly,
  [ValidateSet('archive', 'mqtt', 'saas', 'finish', 'verify', 'all')]
  [string]$Step = 'all',
  [switch]$DryRun,
  [switch]$SkipSshTest
)

$ErrorActionPreference = 'Stop'
$EstRoot = Split-Path $PSScriptRoot -Parent
$Phase1Dir = Join-Path $EstRoot 'deploy\cloud\phase1'
$RemoteScript = Join-Path $Phase1Dir 'remote\phase1-remote-install.sh'
$DistDir = Join-Path $EstRoot 'dist'

function Write-Step([string]$Msg) {
  Write-Host "`n=== $Msg ===" -ForegroundColor Cyan
}

function Get-SshArgs([string]$Key) {
  $args = @('-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=accept-new')
  if ($Key) {
    if (-not (Test-Path $Key)) { throw "SSH key not found: $Key" }
    $args += @('-i', $Key)
  }
  return $args
}

function Invoke-Ssh([string[]]$BaseArgs, [string]$SshHost, [string]$Command) {
  if ($DryRun) {
    Write-Host "[dry-run] ssh $SshHost $Command" -ForegroundColor DarkGray
    return ''
  }
  $out = & ssh @BaseArgs $SshHost $Command 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "SSH failed on ${SshHost}: $out"
  }
  return ($out | Out-String)
}

function Invoke-Scp([string[]]$BaseArgs, [string]$Local, [string]$Remote) {
  if ($DryRun) {
    Write-Host "[dry-run] scp $Local -> $Remote" -ForegroundColor DarkGray
    return
  }
  & scp -C @BaseArgs $Local $Remote
  if ($LASTEXITCODE -ne 0) {
    throw "scp failed: $Local -> $Remote"
  }
}

function Read-EnvFile([string]$Path) {
  $cfg = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim()
    $cfg[$k] = $v
  }
  return $cfg
}

function Require-Cfg([hashtable]$Cfg, [string[]]$Keys) {
  foreach ($k in $Keys) {
    if (-not $Cfg.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($Cfg[$k])) {
      throw "Missing or empty $k in config"
    }
    if ($Cfg[$k] -match '^CHANGE_ME') {
      throw "Replace placeholder for $k in config"
    }
  }
}

function Find-LatestBundle([string]$Pattern) {
  $items = Get-ChildItem $DistDir -Filter $Pattern -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  if (-not $items) { throw "No bundle matching $Pattern in $DistDir - run npm run build:phase1-bundles" }
  return $items[0].FullName
}

function Parse-Phase1Result([string]$Output, [string]$Key) {
  if (-not $Output) { return $null }
  $m = [regex]::Match($Output, "${Key}=(\S+)")
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

function Write-DeployEnvFile([hashtable]$Cfg, [string]$OutPath) {
  $lines = @()
  foreach ($k in ($Cfg.Keys | Sort-Object)) {
    $lines += "$k=$($Cfg[$k])"
  }
  $lines | Set-Content -Path $OutPath -Encoding utf8NoBOM
}

# --- Resolve config (phase1-prod.local.env preferred; legacy phase1-atl.local.env) ---
if (-not $ConfigPath) {
  $prodLocal = Join-Path $Phase1Dir 'phase1-prod.local.env'
  $local = Join-Path $Phase1Dir 'phase1-atl.local.env'
  $example = Join-Path $Phase1Dir 'phase1-atl.env.example'
  if (Test-Path $prodLocal) { $ConfigPath = $prodLocal }
  elseif (Test-Path $local) { $ConfigPath = $local }
  elseif (Test-Path $example) {
    throw "Copy $example to phase1-prod.local.env and fill values before deploy"
  } else {
    throw "No config found - create deploy/cloud/phase1/phase1-prod.local.env"
  }
}
if (-not (Test-Path $ConfigPath)) { throw "Config not found: $ConfigPath" }

Write-Step "Load config"
$cfg = Read-EnvFile $ConfigPath
Require-Cfg $cfg @('ARCHIVE_SSH', 'MQTT_SSH', 'SAAS_SSH', 'MONGODB_URI', 'JWT_SECRET', 'PLATFORM_ADMIN_KEY', 'ARCHIVE_SERVER_TOKEN', 'MOSQUITTO_PASS')

$key = if ($SshKey) { $SshKey } elseif ($cfg.ContainsKey('SSH_KEY') -and $cfg['SSH_KEY']) { $cfg['SSH_KEY'] } else { '' }
$sshArgs = Get-SshArgs $key

if (-not $SkipBuild -and -not $SkipUpload) {
  Write-Step 'Build Phase 1 bundles'
  if (-not $DryRun) {
    & (Join-Path $PSScriptRoot 'create-phase1-bundles.ps1') -EstRoot $EstRoot -OutputDir $DistDir
  }
}

$saasBundle = if ($cfg.ContainsKey('SAAS_BUNDLE') -and $cfg['SAAS_BUNDLE']) { $cfg['SAAS_BUNDLE'] } else { Find-LatestBundle 'peaklogic-cloud-*d.tgz' }
$archiveBundle = if ($cfg.ContainsKey('ARCHIVE_BUNDLE') -and $cfg['ARCHIVE_BUNDLE']) { $cfg['ARCHIVE_BUNDLE'] } else { Find-LatestBundle 'peaklogic-archive-*.tgz' }

Write-Host "Config:     $ConfigPath"
Write-Host "SaaS bundle:  $saasBundle"
Write-Host "Archive:      $archiveBundle"
Write-Host "Archive SSH:  $($cfg['ARCHIVE_SSH'])"
Write-Host "MQTT SSH:     $($cfg['MQTT_SSH'])"
Write-Host "SaaS SSH:     $($cfg['SAAS_SSH'])"

if (-not $SkipSshTest -and -not $DryRun) {
  Write-Step 'SSH connectivity'
  foreach ($h in @($cfg['ARCHIVE_SSH'], $cfg['MQTT_SSH'], $cfg['SAAS_SSH'])) {
    Invoke-Ssh $sshArgs $h 'echo SSH_OK; hostname' | Out-Null
    Write-Host "  OK $h" -ForegroundColor Green
  }
}

$deployEnvLocal = Join-Path $env:TEMP "phase1-deploy-$(Get-Date -Format 'yyyyMMddHHmmss').env"
Write-DeployEnvFile $cfg $deployEnvLocal
$remoteDeployEnv = '/etc/peaklogic/phase1-deploy.env'
$remoteInstallPath = '/tmp/phase1-remote-install.sh'

function Sync-DeployEnv([string]$SshHost) {
  Invoke-Ssh $sshArgs $SshHost "install -d -m 0750 /etc/peaklogic"
  Invoke-Scp $sshArgs $deployEnvLocal "${SshHost}:${remoteDeployEnv}"
  Invoke-Ssh $sshArgs $SshHost "chmod 0640 ${remoteDeployEnv}"
}

function Run-RemoteRole([string]$SshHost, [string]$Role, [string]$BundleLocal, [string]$BundleRemoteName) {
  Write-Step "Role: $Role on $SshHost"
  Sync-DeployEnv $SshHost
  Invoke-Scp $sshArgs $RemoteScript "${SshHost}:${remoteInstallPath}"
  if ($BundleLocal) {
    Invoke-Scp $sshArgs $BundleLocal "${SshHost}:/tmp/${BundleRemoteName}"
  }
  $bundleRemote = if ($BundleLocal) { "/tmp/$BundleRemoteName" } else { '' }
  $cmd = "chmod +x ${remoteInstallPath}; PHASE1_DEPLOY_ENV=${remoteDeployEnv} PHASE1_BUNDLE=${bundleRemote} bash ${remoteInstallPath} ${Role}"
  return Invoke-Ssh $sshArgs $SshHost $cmd
}

function Upload-OnlyHost([string]$SshHost, [string]$BundleLocal, [string]$BundleRemoteName) {
  Write-Step "Upload only: $SshHost"
  Sync-DeployEnv $SshHost
  Invoke-Scp $sshArgs $RemoteScript "${SshHost}:${remoteInstallPath}"
  if ($BundleLocal) {
    Invoke-Scp $sshArgs $BundleLocal "${SshHost}:/tmp/${BundleRemoteName}"
  }
  Invoke-Ssh $sshArgs $SshHost "chmod +x ${remoteInstallPath}" | Out-Null
}

$runArchive = (-not $UploadOnly) -and ($Step -eq 'all' -or $Step -eq 'archive')
$runMqtt = (-not $UploadOnly) -and ($Step -eq 'all' -or $Step -eq 'mqtt')
$runSaas = (-not $UploadOnly) -and ($Step -eq 'all' -or $Step -eq 'saas')
$runFinish = (-not $UploadOnly) -and ($Step -eq 'all' -or $Step -eq 'finish')
$runVerify = (-not $UploadOnly) -and ($Step -eq 'all' -or $Step -eq 'verify')

if (-not $SkipUpload) {
  if ($UploadOnly) {
    Upload-OnlyHost $cfg['ARCHIVE_SSH'] $archiveBundle (Split-Path $archiveBundle -Leaf)
    Upload-OnlyHost $cfg['MQTT_SSH'] $saasBundle (Split-Path $saasBundle -Leaf)
    Upload-OnlyHost $cfg['SAAS_SSH'] $saasBundle (Split-Path $saasBundle -Leaf)
  }
  elseif ($runArchive) {
    $out = Run-RemoteRole $cfg['ARCHIVE_SSH'] 'archive' $archiveBundle (Split-Path $archiveBundle -Leaf)
    $priv = Parse-Phase1Result $out 'PHASE1_RESULT_ARCHIVE_PRIVATE_IP'
    if ($priv) {
      $cfg['ARCHIVE_PRIVATE_IP'] = $priv
      Write-Host "Detected ARCHIVE_PRIVATE_IP=$priv" -ForegroundColor Green
    }
  }

  if ($runMqtt) {
    $out = Run-RemoteRole $cfg['MQTT_SSH'] 'mqtt' $saasBundle (Split-Path $saasBundle -Leaf)
    $priv = Parse-Phase1Result $out 'PHASE1_RESULT_MQTT_PRIVATE_IP'
    if ($priv) {
      $cfg['MQTT_PRIVATE_IP'] = $priv
      Write-Host "Detected MQTT_PRIVATE_IP=$priv" -ForegroundColor Green
    }
  }

  if ($runSaas) {
    Run-RemoteRole $cfg['SAAS_SSH'] 'saas' $saasBundle (Split-Path $saasBundle -Leaf) | Out-Null
  }

  if ($runFinish) {
    if (-not $cfg['MQTT_PRIVATE_IP']) { throw 'MQTT_PRIVATE_IP required for finish - run mqtt step or set in config' }
    if (-not $cfg['ARCHIVE_PRIVATE_IP']) { throw 'ARCHIVE_PRIVATE_IP required for finish - run archive step or set in config' }
    Write-DeployEnvFile $cfg $deployEnvLocal
    Run-RemoteRole $cfg['SAAS_SSH'] 'finish' '' '' | Out-Null
  }

  if ($runVerify) {
    Run-RemoteRole $cfg['SAAS_SSH'] 'verify' '' '' | Out-Null
  }
}

Remove-Item $deployEnvLocal -Force -ErrorAction SilentlyContinue

Write-Step 'Done'
Write-Host @"

Next manual steps (if not done yet):
  1. MongoDB trusted source = SaaS droplet PUBLIC IP
  2. DNS A mqtt.peaklogic.io -> MQTT public IP (if RUN_MQTT_CERTBOT=true)
  3. After verification: DNS A peaklogic.io -> SaaS public IP, update PUBLIC_* URLs, restart SaaS
  4. Field MQTT URL: mqtts://mqtt.peaklogic.io:8883

Checklist: deploy/cloud/phase1/CHECKLIST-ATL-MQTT.txt
"@ -ForegroundColor Green

if ($cfg['ARCHIVE_PRIVATE_IP']) { Write-Host "ARCHIVE_PRIVATE_IP=$($cfg['ARCHIVE_PRIVATE_IP'])" }
if ($cfg['MQTT_PRIVATE_IP']) { Write-Host "MQTT_PRIVATE_IP=$($cfg['MQTT_PRIVATE_IP'])" }

if ($UploadOnly) {
  Write-Host 'Upload-only mode - remote install skipped' -ForegroundColor Yellow
}
