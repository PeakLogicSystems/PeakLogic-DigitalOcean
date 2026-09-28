# One-time SSH + PuTTY key setup for any PeakLogic workstation (Windows).
# Syncs keys from the OneDrive repo, fixes OpenSSH ACLs, and creates PuTTY sessions.
param(
  [string]$RepoRoot = '',
  [string]$PuttyDir = 'C:\Program Files\PuTTY',
  [switch]$SkipPageant
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $RepoRoot = Split-Path $PSScriptRoot -Parent
}
$RepoRoot = (Resolve-Path $RepoRoot).Path

$repoSsh = Join-Path $RepoRoot '.ssh'
$userSsh = Join-Path $env:USERPROFILE '.ssh'
$keyName = 'id_ed25519_peaklogic'
$ppkName = "$keyName.ppk"

$hosts = @(
  @{ Alias = 'mv-saas'; HostName = '159.223.154.210' },
  @{ Alias = 'mv-mqtt'; HostName = '167.99.9.171' },
  @{ Alias = 'mv-archive'; HostName = '159.203.186.17' }
)

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Copy-IfPresent([string]$Source, [string]$Dest) {
  if (-not (Test-Path $Source)) { return $false }
  Copy-Item -Path $Source -Destination $Dest -Force
  return $true
}

function Set-OpenSshKeyAcl([string]$KeyPath) {
  if (-not (Test-Path $KeyPath)) { return }
  icacls $KeyPath /inheritance:r | Out-Null
  icacls $KeyPath /grant:r "$($env:USERNAME):(R)" | Out-Null
}

function Write-SshConfig([string]$ConfigPath, [string]$IdentityPath) {
  $lines = @()
  foreach ($h in $hosts) {
    $lines += @(
      "Host $($h.Alias) $($h.HostName)",
      "  HostName $($h.HostName)",
      '  User root',
      "  IdentityFile $IdentityPath",
      '  IdentitiesOnly yes',
      '  ServerAliveInterval 30',
      '  ServerAliveCountMax 3',
      ''
    )
  }
  $lines | Set-Content -Path $ConfigPath -Encoding ascii
}

function Write-PortableDeployConfig([string]$ConfigPath, [string]$IdentityPath) {
  $h = $hosts[0]
  @(
    "Host $($h.Alias)",
    "  HostName $($h.HostName)",
    '  User root',
    "  IdentityFile $IdentityPath",
    '  IdentitiesOnly yes',
    '  ServerAliveInterval 30',
    '  ServerAliveCountMax 3'
  ) | Set-Content -Path $ConfigPath -Encoding ascii
}

function Set-PuttySession([string]$SessionName, [string]$HostName, [string]$PpkPath) {
  $regPath = "HKCU:\Software\SimonTatham\PuTTY\Sessions\$SessionName"
  New-Item -Path $regPath -Force | Out-Null
  Set-ItemProperty -Path $regPath -Name 'Protocol' -Value 'ssh'
  Set-ItemProperty -Path $regPath -Name 'HostName' -Value $HostName
  Set-ItemProperty -Path $regPath -Name 'PortNumber' -Value 22
  Set-ItemProperty -Path $regPath -Name 'UserName' -Value 'root'
  Set-ItemProperty -Path $regPath -Name 'PublicKeyFile' -Value $PpkPath
  Set-ItemProperty -Path $regPath -Name 'AuthAttempt' -Value 1
  Set-ItemProperty -Path $regPath -Name 'TryAgent' -Value 1
}

Write-Host '=== PeakLogic SSH + PuTTY setup ===' -ForegroundColor Cyan
Write-Host "Repo:  $RepoRoot"
Write-Host "User:  $userSsh"
Write-Host "PuTTY: $PuttyDir"

if (-not (Test-Path (Join-Path $PuttyDir 'plink.exe'))) {
  throw "PuTTY not found at $PuttyDir. Install from https://www.putty.org/ or pass -PuttyDir."
}

Ensure-Dir $userSsh

$keyFiles = @(
  $keyName,
  "$keyName.pub",
  $ppkName,
  'known_hosts'
)
foreach ($file in $keyFiles) {
  $src = Join-Path $repoSsh $file
  $dst = Join-Path $userSsh $file
  if (Copy-IfPresent $src $dst) {
    Write-Host "Synced $file -> $dst" -ForegroundColor DarkGray
  } elseif ($file -eq $keyName) {
    throw "Missing repo SSH key: $src"
  }
}

$userKey = Join-Path $userSsh $keyName
$repoKey = Join-Path $repoSsh $keyName
$ppkPath = Join-Path $repoSsh $ppkName
if (-not (Test-Path $ppkPath)) {
  $ppkPath = Join-Path $userSsh $ppkName
}

Set-OpenSshKeyAcl $userKey
Set-OpenSshKeyAcl $repoKey

$sshConfig = Join-Path $userSsh 'config'
Write-SshConfig $sshConfig $userKey
Write-Host "Wrote OpenSSH config: $sshConfig" -ForegroundColor Green

$portableConfig = Join-Path $repoSsh 'portable-deploy.config'
Write-PortableDeployConfig $portableConfig $repoKey
Write-Host "Wrote portable deploy config: $portableConfig" -ForegroundColor Green

foreach ($h in $hosts) {
  Set-PuttySession $h.Alias $h.HostName $ppkPath
  Write-Host "PuTTY session: $($h.Alias) -> $($h.HostName)" -ForegroundColor Green
}

$plink = Join-Path $PuttyDir 'plink.exe'
$pageant = Join-Path $PuttyDir 'pageant.exe'
$gitPlink = Join-Path $userSsh 'git-plink.cmd'
@(
  "@`"$plink`" -batch -i `"$ppkPath`" %*"
) | Set-Content -Path $gitPlink -Encoding ascii
$gitPlinkForward = ($gitPlink -replace '\\', '/')
& git config --global core.sshCommand $gitPlinkForward
Write-Host "Git core.sshCommand -> $gitPlinkForward" -ForegroundColor Green

$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$pageantLink = Join-Path $startup 'PeakLogic-Pageant.lnk'
if (-not $SkipPageant -and (Test-Path $pageant) -and (Test-Path $ppkPath)) {
  $wsh = New-Object -ComObject WScript.Shell
  $shortcut = $wsh.CreateShortcut($pageantLink)
  $shortcut.TargetPath = $pageant
  $shortcut.Arguments = "`"$ppkPath`""
  $shortcut.WorkingDirectory = $PuttyDir
  $shortcut.Description = 'Load PeakLogic SSH key for PuTTY/Pageant'
  $shortcut.Save()
  Write-Host "Startup shortcut: $pageantLink" -ForegroundColor Green
  Start-Process -FilePath $pageant -ArgumentList "`"$ppkPath`"" -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Cyan
Write-Host 'OpenSSH:  ssh mv-saas'
Write-Host "PuTTY:    putty.exe -load mv-saas"
Write-Host "Plink:    plink -load mv-saas echo ok"
Write-Host 'Deploy:   powershell -File scripts\deploy-hvac-from-onedrive.ps1 -TestConnection'
