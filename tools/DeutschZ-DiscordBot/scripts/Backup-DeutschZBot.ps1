$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
& pnpm migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'backups') | Out-Null
Copy-Item -LiteralPath (Join-Path $Root 'data\deutschz.sqlite') -Destination (Join-Path $Root "backups\deutschz-$Stamp.sqlite")
