#!/bin/bash
# Build and sign "Install edu-pack.app".
#
# A bare .command cannot be notarised: Apple accepts applications, packages and
# disk images. Wrapping the installer in an application also gives the behaviour a
# teacher expects — one double-click, no warning, a dialog when it finishes.
#
# Usage:
#   tools/build-installer-app.sh             build and sign
#   tools/build-installer-app.sh --notarise  build, sign, submit and staple
#
# Signing needs a Developer ID Application certificate in the keychain.
# Notarising needs a stored notarytool keychain profile (see tools/NOTARISE.md).

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
PACK="$(pwd)"
DIST="${PACK}/../dist"
APP_NAME="Install edu-pack"
APP="${DIST}/${APP_NAME}.app"
IDENTITY="${SIGN_IDENTITY:-Developer ID Application: Darren Coxon (2J8K99KZC6)}"
PROFILE="${NOTARY_PROFILE:-edu-pack}"

# Release tags are created by gh on the remote, so fetch them before asking.
/usr/bin/git fetch --tags --quiet 2>/dev/null || true
VERSION="${VERSION:-$(/usr/bin/git describe --tags --abbrev=0 2>/dev/null | /usr/bin/sed 's/^v//')}"
VERSION="${VERSION:-0.0.0}"

echo "pack:    ${PACK}"
echo "app:     ${APP}"
echo "version: ${VERSION}"
echo "signing: ${IDENTITY}"

rm -rf "${APP}"
mkdir -p "${APP}/Contents/MacOS" "${APP}/Contents/Resources/pack"

# ---- Payload -------------------------------------------------------------
/usr/bin/rsync -a \
  --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store' \
  --exclude '*.pdf' --exclude 'papers' \
  "${PACK}/" "${APP}/Contents/Resources/pack/"

# ---- Launcher ------------------------------------------------------------
cat > "${APP}/Contents/MacOS/install" <<'LAUNCHER'
#!/bin/bash
# Runs the installer with the harness's own runtime, then reports the outcome.
set -uo pipefail

HERE="$(cd "$(dirname "$0")/../Resources/pack" && pwd)"
HARNESS="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"

if [ ! -d "$HOME/.dsh" ]; then
  /usr/bin/osascript -e 'display dialog "Open DeepSeek Harness once before installing, then run this again." buttons {"OK"} default button 1 with title "Install edu-pack" with icon caution'
  exit 1
fi

if [ -x "$HARNESS" ]; then
  RUN=(env ELECTRON_RUN_AS_NODE=1 "$HARNESS")
elif command -v node >/dev/null 2>&1; then
  RUN=(node)
else
  /usr/bin/osascript -e 'display dialog "DeepSeek Harness was not found. Install it from deepseek.com/en/harness and run this again." buttons {"OK"} default button 1 with title "Install edu-pack" with icon caution'
  exit 1
fi

OUTPUT="$("${RUN[@]}" "$HERE/install.mjs" --dsh-home "$HOME/.dsh" 2>&1)"
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  /usr/bin/osascript -e 'display dialog "The skills are installed. Quit DeepSeek Harness, open it again, and start a new chat. Type / to see them." buttons {"OK"} default button 1 with title "Install edu-pack" with icon note'
else
  SAFE="$(printf '%s' "$OUTPUT" | tail -12 | /usr/bin/sed 's/["\\]/ /g')"
  /usr/bin/osascript -e "display dialog \"Installation did not complete.\n\n${SAFE}\" buttons {\"OK\"} default button 1 with title \"Install edu-pack\" with icon caution"
fi

exit "$STATUS"
LAUNCHER
chmod +x "${APP}/Contents/MacOS/install"

cat > "${APP}/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>ai.coxon.edu-pack.installer</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>install</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# ---- Sign ----------------------------------------------------------------
# Sign the launcher first, then the bundle. `--deep` is deprecated and hides
# problems; signing inside-out is the supported order.
/usr/bin/codesign --force --timestamp --options runtime \
  --sign "${IDENTITY}" "${APP}/Contents/MacOS/install"
/usr/bin/codesign --force --timestamp --options runtime \
  --sign "${IDENTITY}" "${APP}"

echo
/usr/bin/codesign --verify --strict --verbose=2 "${APP}" 2>&1 | /usr/bin/sed 's/^/  /'
echo "signed and verified"

if [ "${1:-}" != "--notarise" ]; then
  echo
  echo "Next: notarise with"
  echo "  tools/build-installer-app.sh --notarise"
  exit 0
fi

# ---- Notarise ------------------------------------------------------------
ZIP="${DIST}/edu-pack-installer-${VERSION}.zip"
rm -f "${ZIP}"
/usr/bin/ditto -c -k --keepParent "${APP}" "${ZIP}"
echo
echo "submitting ${ZIP} — this takes a few minutes"
/usr/bin/xcrun notarytool submit "${ZIP}" --keychain-profile "${PROFILE}" --wait

/usr/bin/xcrun stapler staple "${APP}"
/usr/bin/xcrun stapler validate "${APP}"

rm -f "${ZIP}"
/usr/bin/ditto -c -k --keepParent "${APP}" "${ZIP}"
echo
echo "notarised and stapled: ${ZIP}"
/usr/bin/spctl -a -vvv -t exec "${APP}" 2>&1 | /usr/bin/sed 's/^/  /'
