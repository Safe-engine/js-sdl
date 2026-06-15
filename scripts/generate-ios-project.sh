#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/ios/xcode"

cd "$ROOT"
bun run build

cmake -S "$ROOT" -B "$BUILD_DIR" -G Xcode \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_ARCHITECTURES=arm64 \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 \
    -DCMAKE_XCODE_ATTRIBUTE_ONLY_ACTIVE_ARCH=NO \
    -DJS_SDL_DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM:-}"

echo "Generated $BUILD_DIR/SDL3Game.xcodeproj"
