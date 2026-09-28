# One-time Mosquitto LAN setup (run PowerShell as Administrator)
$ErrorActionPreference = 'Stop'
$conf = 'C:\Program Files\mosquitto\mosquitto.conf'
$marker = '# PeakLogic dev — LAN listener'
$text = Get-Content $conf -Raw
if ($text -notmatch [regex]::Escape($marker)) {
  Add-Content -Path $conf -Value "`n$marker`nlistener 1883 0.0.0.0`nallow_anonymous true`n"
  Write-Host "Patched $conf"
} else {
  Write-Host 'Already patched'
}
# Allow MQTT from LAN (dev)
$ruleName = 'PeakLogic Mosquitto 1883'
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow | Out-Null
  Write-Host "Firewall rule added: $ruleName"
}
Restart-Service mosquitto -Force
Start-Sleep -Seconds 2
netstat -an | findstr ':1883'
Write-Host 'Done. Run: npm run mqtt:start (from est-pc) to verify.'
