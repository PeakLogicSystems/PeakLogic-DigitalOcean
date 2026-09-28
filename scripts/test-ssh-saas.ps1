# Quick SSH connectivity check for PeakLogic cloud droplets.
param(
  [string]$HostAlias = 'mv-saas',
  [int]$Attempts = 3
)

$ErrorActionPreference = 'Continue'

function Get-PublicIp {
  try { return (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json' -TimeoutSec 10).ip }
  catch { return 'unknown' }
}

Write-Host '=== PeakLogic SSH check ===' -ForegroundColor Cyan
Write-Host "Public IP: $(Get-PublicIp)"
Write-Host ''

$defaults = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
  Sort-Object InterfaceMetric |
  Select-Object InterfaceAlias, NextHop, InterfaceMetric
if ($defaults.Count -gt 1) {
  Write-Host 'WARNING: Multiple default routes (can cause intermittent SSH):' -ForegroundColor Yellow
  $defaults | Format-Table -AutoSize
  Write-Host 'Fix: powershell -ExecutionPolicy Bypass -File scripts\fix-ssh-routing.ps1' -ForegroundColor DarkYellow
  Write-Host ''
}

$ok = 0
foreach ($n in 1..$Attempts) {
  Write-Host "Attempt $n/$Attempts -> $HostAlias" -NoNewline
  $out = & ssh $HostAlias -o ConnectTimeout=12 -o BatchMode=yes 'hostname' 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host " OK ($out)" -ForegroundColor Green
    $ok++
  } else {
    Write-Host ' FAIL' -ForegroundColor Red
    $out | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkRed }
  }
}

Write-Host ''
if ($ok -eq $Attempts) {
  Write-Host "All $Attempts attempts succeeded." -ForegroundColor Green
  exit 0
}

Write-Host "$ok/$Attempts succeeded." -ForegroundColor Yellow
Write-Host ''
Write-Host 'If port 22 fails but https://peaklogic.io works:' -ForegroundColor Cyan
Write-Host '  1. Use Ethernet (ACE_Employees), not guest Wi-Fi'
Write-Host '  2. DigitalOcean -> Firewalls -> fw-saas -> allow TCP 22 from your public IP'
Write-Host '  3. Run: scripts\fix-ssh-routing.ps1'
exit 1
