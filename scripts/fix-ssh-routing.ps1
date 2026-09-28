# Prefer wired Ethernet over Wi-Fi to stop intermittent SSH timeouts on dual-homed PCs.
# Run elevated once per machine: powershell -ExecutionPolicy Bypass -File scripts\fix-ssh-routing.ps1
#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$wiredMetric = 10
$wifiMetric = 75

$ifaces = @('Ethernet', 'Wi-Fi')
foreach ($alias in $ifaces) {
  $iface = Get-NetIPInterface -InterfaceAlias $alias -AddressFamily IPv4 -ErrorAction SilentlyContinue
  if (-not $iface) { continue }
  $metric = if ($alias -eq 'Ethernet') { $wiredMetric } else { $wifiMetric }
  Set-NetIPInterface -InterfaceAlias $alias -InterfaceMetric $metric
  Write-Host "Set $alias interface metric -> $metric" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Default routes (lowest metric wins):' -ForegroundColor Cyan
Get-NetRoute -DestinationPrefix '0.0.0.0/0' |
  Sort-Object InterfaceMetric |
  Format-Table InterfaceAlias, NextHop, InterfaceMetric -AutoSize

Write-Host 'Tip: disconnect guest Wi-Fi when Ethernet is connected.' -ForegroundColor DarkGray
