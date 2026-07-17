param(
    [string]$OutputRoot = 'E:\DeutschZ\DeutschZServer',
    [string]$LocalServerRoot = 'C:\Program Files (x86)\Steam\steamapps\common\DayZServer'
)

$ErrorActionPreference = 'Stop'
$copied = 0

function Copy-Atomic([string]$source, [string]$target) {
    $targetDirectory = Split-Path $target -Parent
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    $tempTarget = Join-Path $targetDirectory ('.codex-sync-' + [guid]::NewGuid().ToString('N'))
    Copy-Item -LiteralPath $source -Destination $tempTarget
    Move-Item -LiteralPath $tempTarget -Destination $target -Force
    $script:copied++
}

$missionSource = Join-Path $OutputRoot 'mpmissions\dayzOffline.chernarusplus'
$missionTarget = Join-Path $LocalServerRoot 'mpmissions\dayzOffline.chernarusplus'
foreach ($file in Get-ChildItem -LiteralPath $missionSource -Recurse -File) {
    $relative = $file.FullName.Substring($missionSource.Length).TrimStart('\')
    if ($relative -match '(^|\\)storage_1(\\|$)') { continue }
    Copy-Atomic $file.FullName (Join-Path $missionTarget $relative)
}

$profileSource = Join-Path $OutputRoot 'profiles'
$profileTarget = Join-Path $LocalServerRoot 'profiles'
foreach ($file in Get-ChildItem -LiteralPath $profileSource -Recurse -File) {
    $relative = $file.FullName.Substring($profileSource.Length).TrimStart('\')
    if ($relative -match '(^|\\)(Logs|LogZ)(\\|$)') { continue }
    if ($file.Extension -match '^\.(log|rpt|adm|mdmp)$') { continue }
    Copy-Atomic $file.FullName (Join-Path $profileTarget $relative)
}

Write-Output "COPIED_SETTINGS_FILES=$copied"
Write-Output 'EXCLUDED=mpmissions/storage_1, profiles/**/Logs, profiles/DeutschZ-System/LogZ, *.log/*.rpt/*.adm/*.mdmp'
