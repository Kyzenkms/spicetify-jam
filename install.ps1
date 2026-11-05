$ErrorActionPreference = "Stop"

$ExtensionName = "spicetify-jam.js"
$ExtensionUrl = "https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/dist/$ExtensionName"
$CustomAppName = "spicetify-jam"
$CustomAppUrl = "https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/custom-app"

Write-Host "Installing Spicetify Jam..." -ForegroundColor Green

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    $defaultPaths = @(
        (Join-Path $env:LOCALAPPDATA "spicetify"),
        (Join-Path $env:USERPROFILE "spicetify"),
        (Join-Path $env:USERPROFILE ".spicetify")
    )
    foreach ($p in $defaultPaths) {
        if (Test-Path (Join-Path $p "spicetify.exe")) {
            $env:PATH = "$p;$env:PATH"
            break
        }
    }
}

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "spicetify not found. Install it first: https://spicetify.app/" -ForegroundColor Red
    exit 1
}

function Invoke-Spicetify {
    param([Parameter(Mandatory = $true)][string[]] $Arguments)

    & spicetify @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "spicetify $($Arguments -join ' ') failed."
    }
}

$UserDataPath = (& spicetify path userdata 2>$null | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($UserDataPath)) {
    $UserDataPath = Join-Path $env:APPDATA "spicetify"
}

$ExtensionsDir = Join-Path $UserDataPath.Trim() "Extensions"
$ExtensionPath = Join-Path $ExtensionsDir $ExtensionName
$CustomAppDir = Join-Path $UserDataPath.Trim() "CustomApps\$CustomAppName"

Write-Host "Preparing extension and custom app folders..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $ExtensionsDir | Out-Null
New-Item -ItemType Directory -Force -Path $CustomAppDir | Out-Null

Write-Host "Downloading latest build..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $ExtensionUrl -UseBasicParsing -OutFile $ExtensionPath

if (-not (Test-Path -LiteralPath $ExtensionPath) -or (Get-Item -LiteralPath $ExtensionPath).Length -eq 0) {
    throw "Downloaded extension is empty: $ExtensionPath"
}

Write-Host "Installing direct Jam links..." -ForegroundColor Yellow
foreach ($File in @("index.js", "manifest.json")) {
    $Destination = Join-Path $CustomAppDir $File
    Invoke-WebRequest -Uri "$CustomAppUrl/$File" -UseBasicParsing -OutFile $Destination
    if ((Get-Item -LiteralPath $Destination).Length -eq 0) {
        throw "Downloaded custom app file is empty: $Destination"
    }
}

Write-Host "Configuring Spicetify..." -ForegroundColor Yellow
$ConfigOutput = & spicetify config extensions 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to read Spicetify extensions config."
}

$ConfiguredExtensions = ($ConfigOutput -join "`n") -split "\r?\n|\|" | ForEach-Object { $_.Trim() }

# Clean up accidental "$ExtensionName+" from previous buggy installer if present
if ($ConfiguredExtensions -contains "$ExtensionName+") {
    & spicetify config extensions "$ExtensionName+-" 2>$null
    $ConfigOutput = & spicetify config extensions 2>$null
    $ConfiguredExtensions = ($ConfigOutput -join "`n") -split "\r?\n|\|" | ForEach-Object { $_.Trim() }
}

if ($ConfiguredExtensions -notcontains $ExtensionName) {
    Invoke-Spicetify -Arguments @("config", "extensions", $ExtensionName)
}
Invoke-Spicetify -Arguments @("config", "custom_apps", $CustomAppName)

Write-Host "Applying changes to Spotify..." -ForegroundColor Yellow
& spicetify apply
if ($LASTEXITCODE -ne 0) {
    Write-Host "spicetify apply failed, trying backup apply..." -ForegroundColor Yellow
    & spicetify backup apply
    if ($LASTEXITCODE -ne 0) {
        throw "spicetify apply and backup apply failed."
    }
}

Write-Host ""
Write-Host "Done! Restart Spotify to use Spicetify Jam." -ForegroundColor Green
Write-Host "   Look for Spicetify Jam in the player bar or sidebar."
