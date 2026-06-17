# Run after closing Cursor/terminals using the old elst folders.
# Removes legacy copies once est / est-pc are verified.

$base = Split-Path -Parent $PSScriptRoot
$legacy = @(
  Join-Path $base 'elst'
  Join-Path $base 'elst-pc'
  Join-Path $base 'ELST'
)

foreach ($path in $legacy) {
  if (-not (Test-Path -LiteralPath $path)) { continue }
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $estPath = Join-Path $base 'est'
  if ($resolved -eq (Resolve-Path -LiteralPath $estPath -ErrorAction SilentlyContinue).Path) { continue }
  Write-Host "Removing legacy folder: $path"
  Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
}

Write-Host "Done. Use C:\users\public\data\est and C:\users\public\data\est-pc"
