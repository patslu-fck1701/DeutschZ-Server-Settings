param(
    [string]$WorkshopRoot = 'C:\Program Files (x86)\Steam\steamapps\common\DayZ\!Workshop\@RUSForma_vehicles',
    [string]$SettingsRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$infoRoot = Join-Path $WorkshopRoot 'info'
$sourceTypes = Join-Path $infoRoot 'RUSForma_vehicles_types.xml'
$sourcePrices = Join-Path $infoRoot 'RUSForma Vehicle Trader !Vehicles Only!.txt'
$ceOutput = Join-Path $SettingsRoot 'mpmissions\dayzOffline.chernarusplus\dz_mod_ce\types_rusforma.xml'
$marketRoot = Join-Path $SettingsRoot 'profiles\ExpansionMod\Market'
$traderRoot = Join-Path $SettingsRoot 'profiles\ExpansionMod\Traders'
$docsRoot = Join-Path $SettingsRoot 'docs\RUSForma'

foreach ($required in @($sourceTypes, $sourcePrices)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing required read-only source: $required" }
}
New-Item -ItemType Directory -Path (Split-Path $ceOutput -Parent), $marketRoot, $docsRoot -Force | Out-Null

[xml]$sourceXml = Get-Content -LiteralPath $sourceTypes -Raw
$vehicleNodes = @($sourceXml.types.type | Where-Object {
    -not $_.category -and [int]$_.nominal -eq 0 -and [int]$_.lifetime -eq 3888000
})
if ($vehicleNodes.Count -ne 242) { throw "Expected 242 vehicle/variant classes after excluding the 34 nominal=1 wheel/door/hood parts, found $($vehicleNodes.Count)." }

$priceMap = @{}
foreach ($line in Get-Content -LiteralPath $sourcePrices) {
    if ($line -match '^\s*([^,<]+?)\s*,\s*VNK\s*,\s*(\d+)\s*,\s*(\d+)') {
        $priceMap[$matches[1].Trim().ToLowerInvariant()] = [int]$matches[2]
    }
}

function Get-Category([string]$className) {
    if ($className -match '(?i)(BTR|BRDM|MTLB|VBL|Gaz_233002_Tiger|M3A1_Scout|AEC_Matador)') { return 'Armored' }
    if ($className -match '(?i)(army|milicia|police|mchs|_vp(?:_|$)|\bgai\b|camo|military)') { return 'Military' }
    if ($className -match '(?i)(airboat|Gecko_ATV|artillery_tractor)') { return 'Special' }
    if ($className -match '(?i)(ZIL|GAZ_66|GAZ_33081|gaz_51|kamaz|kraz|ural|KAVZ|PAZ|LIAZ|Kuban|bus|ambul|ac40|fuel|petrol|benz|kung|pickup|pikap|tractor|UAZ_3962|UAZ_27722|ij_2715|ZIL133)') { return 'Utility' }
    if ($className -match '(?i)(UAZ|Niva|Patriot|patrot|dodge_power|LUAZ|GAZ_69)') { return 'Offroad' }
    return 'Civilian'
}

$defaultPrices = @{ Civilian = 170000; Utility = 195000; Offroad = 180000; Military = 250000; Armored = 350000; Special = 220000 }
$records = foreach ($node in $vehicleNodes) {
    $className = [string]$node.name
    $category = Get-Category $className
    $key = $className.ToLowerInvariant()
    $maxPrice = if ($priceMap.ContainsKey($key)) { $priceMap[$key] } else { $defaultPrices[$category] }
    [pscustomobject]@{
        ClassName = $className
        Category = $category
        MaxPrice = $maxPrice
        MinPrice = [int][Math]::Round($maxPrice * 0.70)
        PriceSource = if ($priceMap.ContainsKey($key)) { 'RUSForma trader list' } else { 'category default' }
    }
}

$settings = New-Object System.Xml.XmlWriterSettings
$settings.Indent = $true
$settings.Encoding = $utf8NoBom
$settings.NewLineChars = "`n"
$writer = [System.Xml.XmlWriter]::Create($ceOutput, $settings)
$writer.WriteStartDocument()
$writer.WriteStartElement('types')
foreach ($record in ($records | Sort-Object ClassName)) {
    $writer.WriteStartElement('type'); $writer.WriteAttributeString('name', $record.ClassName)
    foreach ($pair in @(@('nominal','0'), @('lifetime','3888000'), @('restock','0'), @('min','0'), @('quantmin','-1'), @('quantmax','-1'), @('cost','100'))) {
        $writer.WriteElementString($pair[0], $pair[1])
    }
    $writer.WriteStartElement('flags')
    foreach ($pair in @(@('count_in_cargo','0'), @('count_in_hoarder','0'), @('count_in_map','1'), @('count_in_player','0'), @('crafted','0'), @('deloot','0'))) {
        $writer.WriteAttributeString($pair[0], $pair[1])
    }
    $writer.WriteEndElement(); $writer.WriteEndElement()
}
$writer.WriteEndElement(); $writer.WriteEndDocument(); $writer.Close()

$categoryFiles = @{}
foreach ($category in @('Civilian','Utility','Offroad','Military','Armored','Special')) {
    $items = @($records | Where-Object Category -eq $category | Sort-Object ClassName | ForEach-Object {
        [ordered]@{
            ClassName = $_.ClassName
            MaxPriceThreshold = $_.MaxPrice
            MinPriceThreshold = $_.MinPrice
            SellPricePercent = 3
            MaxStockThreshold = 5
            MinStockThreshold = 1
            QuantityPercent = -1
            SpawnAttachments = @()
            Variants = @()
        }
    })
    $categoryName = "DeutschZ_RUSForma_$category"
    $market = [ordered]@{
        m_Version = 12
        DisplayName = "DeutschZ RUSForma - $category"
        Icon = 'Car'
        Color = 'FBFCFEFF'
        IsExchange = 0
        InitStockPercent = 60.0
        Items = $items
    }
    $marketPath = Join-Path $marketRoot "$categoryName.json"
    [IO.File]::WriteAllText($marketPath, ($market | ConvertTo-Json -Depth 20), $utf8NoBom)
    $categoryFiles[$category] = $categoryName
}

function Add-TraderCategories([string]$path, [string[]]$categories) {
    $trader = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $current = [System.Collections.Generic.List[string]]::new()
    foreach ($entry in $trader.Categories) { if (-not $current.Contains([string]$entry)) { $current.Add([string]$entry) } }
    foreach ($entry in $categories) { if (-not $current.Contains($entry)) { $current.Add($entry) } }
    $trader.Categories = @($current)
    [IO.File]::WriteAllText($path, ($trader | ConvertTo-Json -Depth 20), $utf8NoBom)
}
Add-TraderCategories (Join-Path $traderRoot 'Vehicles.json') @($categoryFiles.Civilian, $categoryFiles.Utility, $categoryFiles.Offroad)
Add-TraderCategories (Join-Path $traderRoot 'Blackmarket_Vehicles.json') @($categoryFiles.Military, $categoryFiles.Armored, $categoryFiles.Special)

$matrix = @('ClassName,Category,MaxPriceThreshold,MinPriceThreshold,PriceSource')
foreach ($record in ($records | Sort-Object Category, ClassName)) {
    $matrix += ('"{0}","{1}",{2},{3},"{4}"' -f $record.ClassName, $record.Category, $record.MaxPrice, $record.MinPrice, $record.PriceSource)
}
[IO.File]::WriteAllLines((Join-Path $docsRoot 'VEHICLE_CLASS_MATRIX.csv'), $matrix, $utf8NoBom)
[IO.File]::WriteAllLines((Join-Path $docsRoot 'MARKET_PRICE_MATRIX.csv'), $matrix, $utf8NoBom)

$summary = [ordered]@{
    VehicleClasses = $records.Count
    SourcePriced = @($records | Where-Object PriceSource -eq 'RUSForma trader list').Count
    DefaultPriced = @($records | Where-Object PriceSource -eq 'category default').Count
    Categories = [ordered]@{}
}
foreach ($category in @('Civilian','Utility','Offroad','Military','Armored','Special')) {
    $summary.Categories[$category] = @($records | Where-Object Category -eq $category).Count
}
[IO.File]::WriteAllText((Join-Path $docsRoot 'generation-summary.json'), ($summary | ConvertTo-Json -Depth 10), $utf8NoBom)
$summary | ConvertTo-Json -Depth 10
