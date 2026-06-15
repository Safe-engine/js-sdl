#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORMAT="${1:-aab}"
VARIANT="${2:-release}"

# shellcheck source=android-env.sh
source "$ROOT/scripts/android-env.sh"

if ! android_java_is_supported; then
    echo "JDK 17 or newer was not found. Run: bun run android:setup" >&2
    exit 2
fi

if [[ ! -f "$ROOT/android/gradle/wrapper/gradle-wrapper.jar" ]]; then
    echo "Gradle wrapper is missing. Run: bun run android:setup" >&2
    exit 2
fi

case "$VARIANT" in
    debug) GRADLE_VARIANT="Debug" ;;
    release) GRADLE_VARIANT="Release" ;;
    *)
        echo "Usage: $0 [apk|aab] [debug|release]" >&2
        exit 2
        ;;
esac

cd "$ROOT"
bun run build

case "$FORMAT" in
    apk) TASK="assemble${GRADLE_VARIANT}" ;;
    aab) TASK="bundle${GRADLE_VARIANT}" ;;
    *)
        echo "Usage: $0 [apk|aab] [debug|release]" >&2
        exit 2
        ;;
esac

cd android
./gradlew --no-daemon "$TASK"

echo "Android package:"
find app/build/outputs -type f \( -name "*.apk" -o -name "*.aab" \) -print
