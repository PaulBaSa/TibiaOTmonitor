#!/usr/bin/env bash
# build-ios-sim.sh — Build and run the iOS app on an iOS Simulator
# Usage: ./build-ios-sim.sh [debug|release]  (defaults to debug)
#
# Requires: macOS, Xcode command-line tools, Node.js, CocoaPods
# The app is always built for the iphonesimulator SDK — no signing required.

set -euo pipefail

# Prefer Homebrew Ruby so CocoaPods uses a modern Ruby (not the broken system 2.6)
export PATH="/usr/local/opt/ruby/bin:/usr/local/lib/ruby/gems/3.2.0/bin:$PATH"

# ── Argument handling ─────────────────────────────────────────────────────────

BUILD_TYPE="${1:-debug}"

if [[ "$BUILD_TYPE" != "debug" && "$BUILD_TYPE" != "release" ]]; then
  echo "Usage: $0 [debug|release]"
  exit 1
fi

case "$BUILD_TYPE" in
  debug)   CONFIGURATION="Debug"   ;;
  release) CONFIGURATION="Release" ;;
esac

echo "==> Build type: $BUILD_TYPE ($CONFIGURATION configuration, iphonesimulator)"

# ── macOS guard ───────────────────────────────────────────────────────────────

if [[ "$(uname)" != "Darwin" ]]; then
  echo "ERROR: iOS builds require macOS."
  exit 1
fi

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$SCRIPT_DIR/mobile"
IOS_DIR="$MOBILE_DIR/ios"
DERIVED_DATA="$SCRIPT_DIR/build/ios-derived"

# ── 1. npm install ────────────────────────────────────────────────────────────

echo ""
echo "==> [1/5] Installing npm dependencies..."
cd "$MOBILE_DIR"
npm install

# ── 2. expo prebuild ──────────────────────────────────────────────────────────

echo ""
echo "==> [2/5] Running expo prebuild (iOS)..."
# --no-install skips the automatic pod install so we control it in step 3.
npx expo prebuild --platform ios --no-install

# ── 3. CocoaPods install ──────────────────────────────────────────────────────

echo ""
echo "==> [3/5] Installing CocoaPods dependencies..."
cd "$IOS_DIR"
pod install

# ── 4. Detect workspace / scheme, then build ─────────────────────────────────

echo ""
echo "==> [4/5] Building $CONFIGURATION for iOS Simulator..."

WORKSPACE=$(ls -d "$IOS_DIR"/*.xcworkspace 2>/dev/null | head -1)
if [[ -z "$WORKSPACE" ]]; then
  echo "ERROR: No .xcworkspace found in $IOS_DIR — did prebuild succeed?"
  exit 1
fi
SCHEME="$(basename "${WORKSPACE%.xcworkspace}")"
echo "==> Workspace : $WORKSPACE"
echo "==> Scheme    : $SCHEME"

xcodebuild build \
  -workspace "$WORKSPACE" \
  -scheme    "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=YES

APP_PATH=$(find "$DERIVED_DATA/Build/Products/$CONFIGURATION-iphonesimulator" \
  -maxdepth 1 -name "*.app" 2>/dev/null | head -1)

if [[ -z "$APP_PATH" ]]; then
  echo "ERROR: .app bundle not found under $DERIVED_DATA/Build/Products/$CONFIGURATION-iphonesimulator/"
  exit 1
fi
echo "==> App bundle : $APP_PATH"

# ── 5. Install and launch on simulator ───────────────────────────────────────

echo ""
echo "==> [5/5] Launching app on iOS Simulator..."

# Read bundle identifier from app.json
BUNDLE_ID=$(node -e "
  let raw = '';
  process.stdin.on('data', c => raw += c);
  process.stdin.on('end', () => {
    const j = JSON.parse(raw);
    const id = (j.expo && j.expo.ios && j.expo.ios.bundleIdentifier) || 'com.tibiaotmonitor';
    process.stdout.write(id);
  });
" < "$MOBILE_DIR/app.json" 2>/dev/null || echo "com.tibiaotmonitor")

# Find an already-booted simulator UDID
BOOTED=$(xcrun simctl list devices --json | node -e "
  let raw = '';
  process.stdin.on('data', c => raw += c);
  process.stdin.on('end', () => {
    const d = JSON.parse(raw);
    const dev = Object.values(d.devices).flat().find(x => x.state === 'Booted');
    process.stdout.write(dev ? dev.udid : '');
  });
")

if [[ -z "$BOOTED" ]]; then
  echo "==> No booted simulator found — booting the latest available iPhone..."
  DEVICE_UDID=$(xcrun simctl list devices available --json | node -e "
    let raw = '';
    process.stdin.on('data', c => raw += c);
    process.stdin.on('end', () => {
      const d = JSON.parse(raw);
      const iphones = Object.values(d.devices).flat()
        .filter(x => x.name.startsWith('iPhone') && x.isAvailable !== false);
      const pick = iphones[iphones.length - 1];
      process.stdout.write(pick ? pick.udid : '');
    });
  ")
  if [[ -z "$DEVICE_UDID" ]]; then
    echo "ERROR: No available iPhone simulator found."
    echo "       Open Xcode → Settings → Platforms and download a simulator runtime."
    exit 1
  fi
  xcrun simctl boot "$DEVICE_UDID"
  BOOTED="$DEVICE_UDID"
fi

# Bring the Simulator window to the foreground
open -a Simulator

echo "==> Installing on simulator $BOOTED..."
xcrun simctl install "$BOOTED" "$APP_PATH"

echo "==> Launching $BUNDLE_ID..."
xcrun simctl launch "$BOOTED" "$BUNDLE_ID"

echo ""
echo "Done! App running on simulator in $BUILD_TYPE mode."
