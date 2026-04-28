#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH="$ROOT_DIR/KataGoSabakiIOS.xcodeproj"
SCHEME="KataGoSabakiIOS"
BUNDLE_ID="local.katago.sabaki.ios"

SIM_DEVICE_NAME="${SIM_DEVICE_NAME:-iPhone 16 Pro}"
SMOKE_SECONDS="${SMOKE_SECONDS:-35}"
LOG_FILE="${LOG_FILE:-$ROOT_DIR/build/simulator.log}"
SCREENSHOT_FILE="${SCREENSHOT_FILE:-$ROOT_DIR/build/sabaki-ios-simulator.png}"

find_device_id() {
  if [[ -n "${SIM_DEVICE_ID:-}" ]]; then
    printf '%s\n' "$SIM_DEVICE_ID"
    return
  fi

  local booted_id
  booted_id="$(xcrun simctl list devices booted | awk -F'[()]' '/iPhone/ {print $2; exit}')"
  if [[ -n "$booted_id" ]]; then
    printf '%s\n' "$booted_id"
    return
  fi

  xcrun simctl list devices available \
    | awk -v name="$SIM_DEVICE_NAME" -F'[()]' '$0 ~ name && $0 !~ /unavailable/ {print $2; exit}'
}

DEVICE_ID="$(find_device_id)"
if [[ -z "$DEVICE_ID" ]]; then
  echo "No available iPhone simulator found. Set SIM_DEVICE_ID or SIM_DEVICE_NAME." >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/build"

echo "Using simulator: $DEVICE_ID"
xcrun simctl boot "$DEVICE_ID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$DEVICE_ID" -b

echo "Building KataGo Sabaki iOS..."
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "id=$DEVICE_ID" \
  build

BUILD_SETTINGS="$(xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "id=$DEVICE_ID" \
  -showBuildSettings)"

BUILT_PRODUCTS_DIR="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/BUILT_PRODUCTS_DIR/ {print $2; exit}')"
FULL_PRODUCT_NAME="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/FULL_PRODUCT_NAME/ {print $2; exit}')"
APP_PATH="$BUILT_PRODUCTS_DIR/$FULL_PRODUCT_NAME"

echo "Installing app: $APP_PATH"
xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl uninstall "$DEVICE_ID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$DEVICE_ID" "$APP_PATH"

echo "Launching and waiting for KataGo analysis..."
: > "$LOG_FILE"
(xcrun simctl launch --console-pty "$DEVICE_ID" "$BUNDLE_ID" 2>&1 | tee "$LOG_FILE") &
LAUNCH_PID=$!

PASSED=0
for _ in $(seq 1 "$SMOKE_SECONDS"); do
  if grep -q "KataGo Sabaki analyze top=" "$LOG_FILE"; then
    PASSED=1
    break
  fi
  sleep 1
done

kill "$LAUNCH_PID" >/dev/null 2>&1 || true
wait "$LAUNCH_PID" >/dev/null 2>&1 || true

xcrun simctl io "$DEVICE_ID" screenshot "$SCREENSHOT_FILE" >/dev/null

if [[ "$PASSED" != "1" ]]; then
  echo "Smoke failed: no KataGo Sabaki analysis line appeared in $LOG_FILE" >&2
  exit 1
fi

echo "Smoke passed."
echo "Log: $LOG_FILE"
echo "Screenshot: $SCREENSHOT_FILE"

