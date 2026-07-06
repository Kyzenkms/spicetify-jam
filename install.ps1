$ErrorActionPreference = "Stop"

$REPO = "https://github.com/Kyzenkms/spicetify-jam.git"
$DIR = "$env:USERPROFILE\.spicetify-jam"

Write-Host "🎵 Installing Spicetify Jam..." -ForegroundColor Green

# Check for git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ git not found. Install git first: https://git-scm.com/downloads" -ForegroundColor Red
    exit 1
}

# Check for npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm not found. Install Node.js first: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check for spicetify
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "❌ spicetify not found. Install it first: https://spicetify.app/" -ForegroundColor Red
    exit 1
}

# Clone or update
if (Test-Path $DIR) {
    Write-Host "📁 Folder exists, updating..." -ForegroundColor Yellow
    Set-Location $DIR
    git fetch origin
    git reset --hard origin/main
} else {
    Write-Host "📥 Cloning repo..." -ForegroundColor Yellow
    git clone $REPO $DIR
    Set-Location $DIR
}

Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install --silent

Write-Host "🔨 Building..." -ForegroundColor Yellow
npm run build

Write-Host "⚙️ Configuring Spicetify..." -ForegroundColor Yellow
spicetify config extensions spicetify-jam.js
spicetify apply

Write-Host ""
Write-Host "✅ Done! Restart Spotify to use Spicetify Jam." -ForegroundColor Green
Write-Host "   Look for the 🎵 icon in the bottom-right player bar."
