#!/usr/bin/env bash
set -e

EXTENSION_NAME="spicetify-jam.js"

echo "🗑 Uninstalling Spicetify Jam..."

if ! command -v spicetify &>/dev/null; then
  echo "❌ spicetify not found. Install it first: https://spicetify.app/"
  exit 1
fi

# Remove extension from config (append - to disable)
echo "⚙️ Removing from Spicetify config..."
spicetify config extensions "${EXTENSION_NAME}-"

# Delete the extension file
SPICETIFY_DATA_DIR="$(spicetify path userdata 2>/dev/null || true)"
if [ -z "$SPICETIFY_DATA_DIR" ]; then
  SPICETIFY_DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/spicetify"
fi
EXTENSION_PATH="${SPICETIFY_DATA_DIR}/Extensions/${EXTENSION_NAME}"

if [ -f "$EXTENSION_PATH" ]; then
  echo "📁 Deleting extension file..."
  rm -f "$EXTENSION_PATH"
fi

# Apply changes
spicetify apply

echo ""
echo "✅ Spicetify Jam uninstalled successfully!"
echo "   Restart Spotify to see changes."