$ErrorActionPreference = "Stop"

$ExtensionName = "spicetify-jam.js"

Write-Host "🗑 Uninstalling Spicetify Jam..." -ForegroundColor Green

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

Write-Host "⚙️ Removing from Spicetify config..." -ForegroundColor Yellow
Invoke-Spicetify @("config", "extensions", "${ExtensionName}-")

if (Test-Path -LiteralPath $ExtensionPath) {
    Write-Host "📁 Deleting extension file..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $ExtensionPath -Force
}

Invoke-Spicetify @("apply")

Write-Host ""
Write-Host "✅ Spicetify Jam uninstalled successfully!" -ForegroundColor Green
Write-Host "   Restart Spotify to see changes."