#!/usr/bin/env bash
# build-android.sh — Build and install the Android app on a connected device
# Usage: ./build-android.sh [debug|release]  (defaults to debug)
#
# Debug builds bundle the JS inline (no Metro server required) so the APK
# works as a standalone install on the device.

set -euo pipefail

BUILD_TYPE="${1:-debug}"

if [[ "$BUILD_TYPE" != "debug" && "$BUILD_TYPE" != "release" ]]; then
  echo "Usage: $0 [debug|release]"
  exit 1
fi

echo "==> Build type: $BUILD_TYPE"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$SCRIPT_DIR/mobile"

# ── 1. npm install ────────────────────────────────────────────────────────────
echo ""
echo "==> [1/4] Installing npm dependencies..."
cd "$MOBILE_DIR"
npm install

# ── 2. expo prebuild ──────────────────────────────────────────────────────────
echo ""
echo "==> [2/4] Running expo prebuild (Android)..."
npx expo prebuild --platform android --clean

# ── 3. Gradle build ───────────────────────────────────────────────────────────
echo ""
echo "==> [3/4] Building Android APK ($BUILD_TYPE)..."
cd "$MOBILE_DIR/android"

if [[ "$BUILD_TYPE" == "release" ]]; then
  ./gradlew assembleRelease
  APK_PATH="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"
else
  # BUNDLE_IN_DEBUG=true embeds the JS bundle inside the APK so the app
  # doesn't need a Metro dev server running on the host machine.
  ./gradlew assembleDebug -PbundleInDebug=true
  APK_PATH="$MOBILE_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "ERROR: APK not found at $APK_PATH"
  exit 1
fi

echo "==> APK built: $APK_PATH"

# ── 4. Install + launch on connected device ───────────────────────────────────
echo ""
echo "==> [4/4] Installing APK on connected device..."
adb install -r "$APK_PATH"

# Resolve the package name from the app.json applicationId or fall back to a default
APP_JSON="$MOBILE_DIR/app.json"
PACKAGE_NAME=$(node -e "
  const f = require('$APP_JSON');
  const id = (f.expo && f.expo.android && f.expo.android.package) || 'com.tibia.otmonitor';
  process.stdout.write(id);
" 2>/dev/null || echo "com.tibia.otmonitor")

echo "==> Launching $PACKAGE_NAME on device..."
adb shell am start -n "$PACKAGE_NAME/.MainActivity"

echo ""
echo "Done! App installed and launched in $BUILD_TYPE mode."
