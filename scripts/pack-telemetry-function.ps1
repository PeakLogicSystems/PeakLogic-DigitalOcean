#Requires -Version 5.1
<#
.SYNOPSIS
  Pack telemetry-ingest Azure Function (copies shared ingest + db libs, npm install, zip).

.EXAMPLE
  .\pack-telemetry-function.ps1 -ZipPath C:\temp\telemetry-ingest.zip
#>
param(
  [string]$ZipPath = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$FnRoot = Join-Path $RepoRoot 'products/mv-cloud-azure/functions/telemetry-ingest'
$Stage = Join-Path $env:TEMP "mv-telemetry-fn-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"

if (-not $ZipPath) {
  $ZipPath = Join-Path $env:TEMP 'telemetry-ingest.zip'
}

Write-Host "Staging function at $Stage" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $Stage -Force | Out-Null

Copy-Item -Path (Join-Path $FnRoot 'package.json') -Destination $Stage
Copy-Item -Path (Join-Path $FnRoot 'host.json') -Destination $Stage
Copy-Item -Path (Join-Path $FnRoot 'src') -Destination $Stage -Recurse

$lib = Join-Path $Stage 'src/lib'
New-Item -ItemType Directory -Path (Join-Path $lib 'ingest') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $lib 'db') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $lib 'product') -Force | Out-Null

Copy-Item -Path (Join-Path $RepoRoot 'src/ingest/*') -Destination (Join-Path $lib 'ingest')
Copy-Item -Path (Join-Path $RepoRoot 'src/db/mongo.js') -Destination (Join-Path $lib 'db')
Copy-Item -Path (Join-Path $RepoRoot 'src/config.js') -Destination $lib
Copy-Item -Path (Join-Path $RepoRoot 'src/loadEnv.js') -Destination $lib
Copy-Item -Path (Join-Path $RepoRoot 'src/product/edition.js') -Destination (Join-Path $lib 'product')

Push-Location $Stage
try {
  npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Host
} finally {
  Pop-Location
}

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $ZipPath -Force
Remove-Item $Stage -Recurse -Force

Write-Host "Packed: $ZipPath" -ForegroundColor Green
Write-Output $ZipPath
