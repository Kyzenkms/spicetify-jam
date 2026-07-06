#!/usr/bin/env bash
set -e

REPO="https://github.com/Kyzenkms/spicetify-jam.git"
DIR="$HOME/.spicetify-jam"

echo "🎵 Installing Spicetify Jam..."

# Check for git
if ! command -v git &>/dev/null; then
  echo "❌ git not found. Install git first: https://git-scm.com/downloads"
  exit 1
fi

# Check for node/npm
if ! command -v npm &>/dev/null; then
  echo "❌ npm not found. Install Node.js first: https://nodejs.org/"
  exit 1
fi

# Check for spicetify
if ! command -v spicetify &>/dev/null; then
  echo "❌ spicetify not found. Install it first: https://spicetify.app/"
  exit 1
fi

# Clone or update
if [ -d "$DIR" ]; then
  echo "📁 Folder exists, updating..."
  cd "$DIR"
  git fetch origin
  git reset --hard origin/main
else
  echo "📥 Cloning repo..."
  git clone "$REPO" "$DIR"
  cd "$DIR"
fi

echo "📦 Installing dependencies..."
npm install --silent

echo "🔨 Building..."
npm run build

echo "⚙️ Configuring Spicetify..."
spicetify config extensions spicetify-jam.js
spicetify apply

echo ""
echo "✅ Done! Restart Spotify to use Spicetify Jam."
echo "   Look for the 🎵 icon in the bottom-right player bar."
