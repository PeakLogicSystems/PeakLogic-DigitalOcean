# Build PeaklogicOptaRoom sketch from arduino-opta-mqtt-st + room overlays.
# Run once after clone/pull, then open PeaklogicOptaRoom/PeaklogicOptaRoom.ino in Arduino IDE.

$ErrorActionPreference = 'Stop'
$roomRoot = Split-Path $PSScriptRoot -Parent
$src = Join-Path $roomRoot '..\arduino-opta-mqtt-st\PeaklogicOptaMqttSt'
$dst = Join-Path $roomRoot 'PeaklogicOptaRoom'
$overlay = Join-Path $roomRoot 'overlays\PeaklogicOptaRoom'

if (-not (Test-Path $src)) {
  Write-Error "Source not found: $src"
}

if (Test-Path $dst) {
  Remove-Item $dst -Recurse -Force
}

Copy-Item -Path $src -Destination $dst -Recurse
Copy-Item -Path (Join-Path $overlay '*') -Destination $dst -Force
Remove-Item (Join-Path $dst 'PeaklogicOptaMqttSt.ino') -ErrorAction SilentlyContinue

Write-Host "PeaklogicOptaRoom sketch ready at: $dst"
Write-Host "Open PeaklogicOptaRoom.ino in Arduino IDE (Board: Arduino Opta WiFi)."
