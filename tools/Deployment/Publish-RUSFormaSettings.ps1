param(
    [string]$SettingsRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$OutputRoot = 'E:\DeutschZ\DeutschZServer',
    [string]$LocalServerRoot = 'C:\Program Files (x86)\Steam\steamapps\common\DayZServer',
    [string]$WorkshopRoot = 'C:\Program Files (x86)\Steam\steamapps\common\DayZ\!Workshop\@RUSForma_vehicles'
)

$ErrorActionPreference = 'Stop'
$stageRoot = Join-Path $env:TEMP ("DeutschZ_settings_" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

function Publish-File([string]$source, [string]$target) {
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing source file: $source" }
    $targetDirectory = Split-Path $target -Parent
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    $tempTarget = Join-Path $targetDirectory ('.codex-stage-' + [guid]::NewGuid().ToString('N'))
    Copy-Item -LiteralPath $source -Destination $tempTarget
    try {
        Move-Item -LiteralPath $tempTarget -Destination $target -Force
    } finally {
        if (Test-Path -LiteralPath $tempTarget) { Remove-Item -LiteralPath $tempTarget -Force }
    }
}

try {
    $relativeFiles = @(
        'modlist.txt',
        'DeutschZ_Start_local.bat',
        'mpmissions\dayzOffline.chernarusplus\cfgeconomycore.xml',
        'mpmissions\dayzOffline.chernarusplus\dz_mod_ce\types_rusforma.xml',
        'profiles\ExpansionMod\Market\DeutschZ_RUSForma_Civilian.json',
        'profiles\ExpansionMod\Market\DeutschZ_RUSForma_Utility.json',
        'profiles\ExpansionMod\Market\DeutschZ_RUSForma_Offroad.json',
        'profiles\ExpansionMod\Market\DeutschZ_RUSForma_Military.json',
        'profiles\ExpansionMod\Market\DeutschZ_RUSForma_Armored.json',
        'profiles\ExpansionMod\Market\DeutschZ_RUSForma_Special.json',
        'profiles\ExpansionMod\Traders\Vehicles.json',
        'profiles\ExpansionMod\Traders\Blackmarket_Vehicles.json'
    )
    foreach ($relative in $relativeFiles) {
        $source = Join-Path $SettingsRoot $relative
        $staged = Join-Path $stageRoot $relative
        New-Item -ItemType Directory -Path (Split-Path $staged -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $staged
    }
    foreach ($relative in $relativeFiles) {
        $staged = Join-Path $stageRoot $relative
        Publish-File $staged (Join-Path $OutputRoot $relative)
        Publish-File $staged (Join-Path $LocalServerRoot $relative)
    }

    foreach ($relative in @(
        'docs\RUSForma\INVENTORY.md',
        'docs\RUSForma\DEPENDENCIES.md',
        'docs\RUSForma\VEHICLE_CLASS_MATRIX.csv',
        'docs\RUSForma\MARKET_PRICE_MATRIX.csv',
        'docs\RUSForma\ECONOMY_REPORT.md',
        'docs\RUSForma\MARKET_REPORT.md',
        'docs\RUSForma\generation-summary.json',
        'docs\SERVER_LOCAL_MODLIST.md',
        'docs\ONLY_CORE_CONTENTS.md',
        'docs\LOCAL_LIVESETTINGS_SYNC.md'
    )) {
        Publish-File (Join-Path $SettingsRoot $relative) (Join-Path $OutputRoot $relative)
    }

    $publicKey = Join-Path $WorkshopRoot 'Keys\RUS67pak.bikey'
    Publish-File $publicKey (Join-Path $OutputRoot 'keys\RUS67pak.bikey')
    Publish-File $publicKey (Join-Path $LocalServerRoot 'keys\RUS67pak.bikey')

    $localCore = Join-Path $LocalServerRoot '@DeutschZ_only_core'
    $outputCore = Join-Path $OutputRoot '@DeutschZ_only_core'
    $coreStage = Join-Path $stageRoot '@DeutschZ_only_core'
    Copy-Item -LiteralPath $outputCore -Destination $coreStage -Recurse
    $oldCore = Join-Path $stageRoot 'old_local_only_core'
    if (Test-Path -LiteralPath $localCore) { Move-Item -LiteralPath $localCore -Destination $oldCore }
    try {
        Move-Item -LiteralPath $coreStage -Destination $localCore
        if (@(Get-ChildItem -LiteralPath (Join-Path $localCore 'Addons') -Filter '*.pbo').Count -ne 3) { throw 'Local only_core validation failed.' }
        if (Test-Path -LiteralPath $oldCore) { Remove-Item -LiteralPath $oldCore -Recurse -Force }
    } catch {
        if (Test-Path -LiteralPath $localCore) { Remove-Item -LiteralPath $localCore -Recurse -Force }
        if (Test-Path -LiteralPath $oldCore) { Move-Item -LiteralPath $oldCore -Destination $localCore }
        throw
    }

    $rusLink = Join-Path $LocalServerRoot '@RUSForma_vehicles'
    if (-not (Test-Path -LiteralPath $rusLink)) {
        New-Item -ItemType Junction -Path $rusLink -Target $WorkshopRoot | Out-Null
    } else {
        $item = Get-Item -LiteralPath $rusLink -Force
        if ($item.LinkType -ne 'Junction' -or $item.Target[0] -ne $WorkshopRoot) {
            throw "Existing @RUSForma_vehicles is not the expected Workshop junction: $($item.FullName)"
        }
    }

    Write-Output "OUTPUT=$OutputRoot"
    Write-Output "LOCAL=$LocalServerRoot"
    Get-Item -LiteralPath $rusLink -Force | Select-Object FullName, LinkType, Target
} finally {
    if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
}
