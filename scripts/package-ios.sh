#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/ios/xcode"
ARCHIVE="$ROOT/ios/build/JSSDL.xcarchive"
EXPORT_DIR="$ROOT/ios/build/export"

if [[ -z "${DEVELOPMENT_TEAM:-}" ]]; then
    echo "Set DEVELOPMENT_TEAM to your Apple Developer team ID." >&2
    exit 2
fi

"$ROOT/scripts/generate-ios-project.sh"

xcodebuild \
    -project "$BUILD_DIR/SDL3Game.xcodeproj" \
    -scheme sdl3js \
    -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE" \
    DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
    -allowProvisioningUpdates \
    archive

rm -rf "$EXPORT_DIR"
xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$ROOT/ios/ExportOptions.plist" \
    -allowProvisioningUpdates

echo "iOS package:"
find "$EXPORT_DIR" -type f -name "*.ipa" -print
