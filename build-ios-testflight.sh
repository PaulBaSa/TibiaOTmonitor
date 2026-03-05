#!/usr/bin/env bash
# build-ios-testflight.sh — Build and upload a release IPA to TestFlight
#
# Usage:
#   ./build-ios-testflight.sh
#
# Prerequisites:
#   - macOS with Xcode installed
#   - Apple ID logged in to Xcode (Settings → Accounts)
#   - Valid Apple Distribution certificate in Keychain
#
# Steps performed:
#   1. npm install
#   2. expo prebuild (iOS)
#   3. Patch Xcode signing for distribution
#   4. xcodebuild archive
#   5. xcodebuild exportArchive + upload → TestFlight

set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$SCRIPT_DIR/mobile"
BUILD_DIR="$SCRIPT_DIR/build/ios"
ARCHIVE_PATH="$BUILD_DIR/TibiaOTMonitor.xcarchive"
EXPORT_PATH="$BUILD_DIR/ipa"
EXPORT_OPTIONS_PLIST="$BUILD_DIR/ExportOptions.plist"
WORKSPACE="$MOBILE_DIR/ios/TibiaOTMonitor.xcworkspace"
SCHEME="TibiaOTMonitor"
BUNDLE_ID="com.tuinsomnia.tibiaotmonitor"

mkdir -p "$BUILD_DIR"

# ── 1. npm install ─────────────────────────────────────────────────────────────
echo ""
echo "==> [1/6] Installing npm dependencies..."
cd "$MOBILE_DIR"
npm install

# ── 2. expo prebuild ──────────────────────────────────────────────────────────
echo ""
echo "==> [2/6] Running expo prebuild (iOS)..."
npx expo prebuild --platform ios --clean

# ── 3. Patch signing identity for App Store distribution ──────────────────────
echo ""
echo "==> [3/6] Patching Xcode signing for distribution..."
PBXPROJ="$MOBILE_DIR/ios/TibiaOTMonitor.xcodeproj/project.pbxproj"
# expo prebuild sets explicit CODE_SIGN_IDENTITY which conflicts with automatic distribution signing
# Remove it so CODE_SIGN_STYLE=Automatic can freely pick the Distribution certificate for archiving
sed -i '' '/"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]"/d' "$PBXPROJ"
echo "==> Patched: removed explicit CODE_SIGN_IDENTITY (automatic signing will use Distribution)"

# ── 4. xcodebuild archive ─────────────────────────────────────────────────────
echo ""
echo "==> [4/6] Archiving (this may take a few minutes)..."
cd "$MOBILE_DIR"
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="W449469S62" \
  -allowProvisioningUpdates

if [[ ! -d "$ARCHIVE_PATH" ]]; then
  echo "ERROR: Archive not found at $ARCHIVE_PATH"
  exit 1
fi
echo "==> Archive created: $ARCHIVE_PATH"

# ── 5. Export + Upload to TestFlight ──────────────────────────────────────────
echo ""
echo "==> [5/5] Exporting and uploading to TestFlight..."

# destination=upload sends directly to App Store Connect — no separate xcrun altool needed
cat > "$EXPORT_OPTIONS_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>destination</key>
  <string>upload</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
  -allowProvisioningUpdates

echo ""
echo "================================================================"
echo " Upload complete!"
echo " Visit App Store Connect to monitor processing:"
echo " https://appstoreconnect.apple.com/apps"
echo "================================================================"
