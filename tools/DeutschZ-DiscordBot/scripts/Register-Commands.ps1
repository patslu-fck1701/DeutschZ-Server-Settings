$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$CurrentEnv = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\DeutschZ-DiscordBot.env'
if (Test-Path -LiteralPath $CurrentEnv) { [Environment]::SetEnvironmentVariable('DEUTSCHZ_ENV_FILE', $CurrentEnv, 'Process') }
Set-Location -LiteralPath $Root
& pnpm register
exit $LASTEXITCODE
