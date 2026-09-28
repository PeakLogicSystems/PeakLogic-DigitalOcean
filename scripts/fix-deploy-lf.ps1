# Convert deploy/cloud shell scripts and systemd units to LF line endings.
$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'deploy\cloud'
$utf8 = New-Object System.Text.UTF8Encoding $false
Get-ChildItem $root -Recurse -File | Where-Object {
  $_.Extension -in @('.sh', '.service') -or $_.Name -like '.env*'
} | ForEach-Object {
  $text = [System.IO.File]::ReadAllText($_.FullName)
  $text = $text -replace "`r`n", "`n" -replace "`r", "`n"
  [System.IO.File]::WriteAllText($_.FullName, $text, $utf8)
  Write-Host "LF: $($_.FullName)"
}
