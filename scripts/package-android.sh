#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORMAT="${1:-aab}"
VARIANT="${2:-release}"

cd "$ROOT"
bun run build

case "$FORMAT" in
    apk) TASK="assemble${VARIANT^}" ;;
    aab) TASK="bundle${VARIANT^}" ;;
    *)
        echo "Usage: $0 [apk|aab] [debug|release]" >&2
        exit 2
        ;;
esac

cd android
./gradlew "$TASK"

echo "Android package:"
find app/build/outputs -type f \( -name "*.apk" -o -name "*.aab" \) -print
