$ErrorActionPreference = "Stop"

$ExtensionName = "spicetify-jam.js"
$ExtensionUrl = "https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/dist/$ExtensionName"

Write-Host "🎵 Installing Spicetify Jam..." -ForegroundColor Green

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "❌ spicetify not found. Install it first: https://spicetify.app/" -ForegroundColor Red
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

Write-Host "📁 Preparing Extensions folder..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $ExtensionsDir | Out-Null

Write-Host "📥 Downloading latest build..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $ExtensionUrl -UseBasicParsing -OutFile $ExtensionPath

if (-not (Test-Path -LiteralPath $ExtensionPath) -or (Get-Item -LiteralPath $ExtensionPath).Length -eq 0) {
    throw "Downloaded extension is empty: $ExtensionPath"
}

Write-Host "⚙️ Configuring Spicetify..." -ForegroundColor Yellow
$ConfigOutput = & spicetify config extensions 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to read Spicetify extensions config."
}

$ConfiguredExtensions = ($ConfigOutput -join "`n") -split "\r?\n|\|" | ForEach-Object { $_.Trim() }

if ($ConfiguredExtensions -notcontains $ExtensionName) {
    Invoke-Spicetify @("config", "extensions", $ExtensionName)
}

Invoke-Spicetify @("apply")

Write-Host ""
Write-Host "✅ Done! Restart Spotify to use Spicetify Jam." -ForegroundColor Green
Write-Host "   Look for the 🎵 icon in the bottom-right player bar."
