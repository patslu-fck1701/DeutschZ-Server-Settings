$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DesktopEnv = Join-Path ([Environment]::GetFolderPath('Desktop')) 'env'
$CurrentEnv = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\DeutschZ-DiscordBot.env'
$EnvFile = if (Test-Path -LiteralPath $CurrentEnv) { $CurrentEnv } elseif (Test-Path -LiteralPath $DesktopEnv) { $DesktopEnv } else { $null }
if ($EnvFile) { [Environment]::SetEnvironmentVariable('DEUTSCHZ_ENV_FILE', $EnvFile, 'Process') }
Set-Location -LiteralPath $Root
& node .\dist\index.js
exit $LASTEXITCODE
