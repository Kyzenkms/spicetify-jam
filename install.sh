#!/usr/bin/env bash
set -e

EXTENSION_NAME="spicetify-jam.js"
EXTENSION_URL="https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/dist/${EXTENSION_NAME}"
CUSTOM_APP_NAME="spicetify-jam"
CUSTOM_APP_URL="https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/custom-app"

echo "🎵 Installing Spicetify Jam..."

if ! command -v spicetify &>/dev/null; then
  for p in "$HOME/.spicetify" "$HOME/.local/bin" "/usr/local/bin"; do
    if [ -x "$p/spicetify" ]; then
      export PATH="$p:$PATH"
      break
    fi
  done
fi

if ! command -v spicetify &>/dev/null; then
  echo "❌ spicetify not found. Install it first: https://spicetify.app/"
  exit 1
fi

SPICETIFY_DATA_DIR="$(spicetify path userdata 2>/dev/null || true)"
if [ -z "$SPICETIFY_DATA_DIR" ]; then
  SPICETIFY_DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/spicetify"
fi

EXTENSIONS_DIR="${SPICETIFY_DATA_DIR}/Extensions"
EXTENSION_PATH="${EXTENSIONS_DIR}/${EXTENSION_NAME}"
CUSTOM_APP_DIR="${SPICETIFY_DATA_DIR}/CustomApps/${CUSTOM_APP_NAME}"

echo "📁 Preparing Extensions folder..."
mkdir -p "$EXTENSIONS_DIR" "$CUSTOM_APP_DIR"

echo "📥 Downloading latest build..."
if command -v curl &>/dev/null; then
  curl -fsSL "$EXTENSION_URL" -o "$EXTENSION_PATH"
elif command -v wget &>/dev/null; then
  wget -q "$EXTENSION_URL" -O "$EXTENSION_PATH"
else
  echo "❌ curl or wget is required to download the extension."
  exit 1
fi

if [ ! -s "$EXTENSION_PATH" ]; then
  echo "❌ Downloaded extension is empty: $EXTENSION_PATH"
  exit 1
fi

echo "🔗 Installing direct Jam links..."
for file in index.js manifest.json; do
  if command -v curl &>/dev/null; then
    curl -fsSL "$CUSTOM_APP_URL/$file" -o "$CUSTOM_APP_DIR/$file"
  else
    wget -q "$CUSTOM_APP_URL/$file" -O "$CUSTOM_APP_DIR/$file"
  fi
  if [ ! -s "$CUSTOM_APP_DIR/$file" ]; then
    echo "❌ Downloaded custom app file is empty: $CUSTOM_APP_DIR/$file"
    exit 1
  fi
done

echo "⚙️ Configuring Spicetify..."
CURRENT_EXTENSIONS="$(spicetify config extensions 2>/dev/null || true)"

# Clean up accidental "${EXTENSION_NAME}+" from previous buggy installer if present
if printf '%s\n' "$CURRENT_EXTENSIONS" | tr '|' '\n' | grep -Fxq "${EXTENSION_NAME}+"; then
  spicetify config extensions "${EXTENSION_NAME}+-" || true
  CURRENT_EXTENSIONS="$(spicetify config extensions 2>/dev/null || true)"
fi

if ! printf '%s\n' "$CURRENT_EXTENSIONS" | tr '|' '\n' | grep -Fxq "$EXTENSION_NAME"; then
  spicetify config extensions "$EXTENSION_NAME"
fi
spicetify config custom_apps "$CUSTOM_APP_NAME"

echo "🚀 Applying changes to Spotify..."
if ! spicetify apply; then
  echo "⚠️ spicetify apply failed, trying backup apply..."
  spicetify backup apply
fi

echo ""
echo "✅ Done! Restart Spotify to use Spicetify Jam."
echo "   Look for the Jam icon ((•)) in the bottom-right player bar."
