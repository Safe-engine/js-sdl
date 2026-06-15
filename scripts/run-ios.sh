#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/ios/simulator"
DERIVED_DATA="$ROOT/ios/build/simulator-derived"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"

if [[ -n "${IOS_SIMULATOR_UDID:-}" ]]; then
    DEVICE_UDID="$IOS_SIMULATOR_UDID"
    DEVICE_STATE=""
    DEVICE_NAME="$IOS_SIMULATOR_UDID"
else
    DEVICE_JSON="$(xcrun simctl list devices available -j)"
    DEVICE="$(
        node -e '
            const devices = Object.values(JSON.parse(process.argv[1]).devices).flat();
            const iphones = devices.filter(
                device => device.isAvailable !== false && device.name.startsWith("iPhone ")
            );
            const selected = iphones.find(device => device.state === "Booted") || iphones[0];
            if (!selected) process.exit(1);
            process.stdout.write([selected.udid, selected.state, selected.name].join("\t"));
        ' "$DEVICE_JSON"
    )" || {
        echo "No available iPhone Simulator was found. Install an iOS Simulator runtime in Xcode." >&2
        exit 2
    }
    IFS=$'\t' read -r DEVICE_UDID DEVICE_STATE DEVICE_NAME <<< "$DEVICE"
fi

if [[ "$DEVICE_STATE" != "Booted" ]]; then
    echo "Booting $DEVICE_NAME..."
    xcrun simctl boot "$DEVICE_UDID"
fi
xcrun simctl bootstatus "$DEVICE_UDID" -b

cd "$ROOT"
bun run build

cmake -S "$ROOT" -B "$BUILD_DIR" -G Xcode \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_SYSROOT=iphonesimulator \
    -DCMAKE_OSX_ARCHITECTURES="$(uname -m)" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 \
    -DCMAKE_XCODE_ATTRIBUTE_ONLY_ACTIVE_ARCH=YES

xcodebuild \
    -project "$BUILD_DIR/SDL3Game.xcodeproj" \
    -scheme sdl3js \
    -configuration "$CONFIGURATION" \
    -destination "id=$DEVICE_UDID" \
    -derivedDataPath "$DERIVED_DATA" \
    -quiet \
    CODE_SIGNING_ALLOWED=NO \
    build

APP="$(
    find "$BUILD_DIR" \
        -type d -path "*-iphonesimulator/sdl3js.app" -print -quit
)"
if [[ -z "$APP" ]]; then
    echo "Could not find the built sdl3js.app under $BUILD_DIR." >&2
    exit 1
fi

BUNDLE_ID="$(
    /usr/libexec/PlistBuddy -c "Print:CFBundleIdentifier" "$APP/Info.plist"
)"

xcrun simctl install "$DEVICE_UDID" "$APP"
xcrun simctl launch --terminate-running-process "$DEVICE_UDID" "$BUNDLE_ID"

echo "Launched $BUNDLE_ID on $DEVICE_NAME"
