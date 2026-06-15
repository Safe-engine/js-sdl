#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRADLE_VERSION="9.4.1"
SDK_ROOT="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

# shellcheck source=android-env.sh
source "$ROOT/scripts/android-env.sh"

if [[ "$(uname -s)" == "Darwin" ]]; then
    if { ! android_java_is_supported || ! command -v sdkmanager >/dev/null 2>&1; } &&
        ! command -v brew >/dev/null 2>&1; then
        echo "Homebrew is required. Install it from https://brew.sh, then rerun this script." >&2
        exit 2
    fi

    if ! android_java_is_supported; then
        brew list --formula openjdk@17 >/dev/null 2>&1 || brew install openjdk@17
    fi
    if ! command -v sdkmanager >/dev/null 2>&1; then
        brew list --cask android-commandlinetools >/dev/null 2>&1 ||
            brew install --cask android-commandlinetools
    fi
fi

# shellcheck source=android-env.sh
source "$ROOT/scripts/android-env.sh"

if ! android_java_is_supported; then
    echo "JDK 17 or newer was not found. Set JAVA_HOME and rerun this script." >&2
    exit 2
fi

SDKMANAGER="$(command -v sdkmanager || true)"
if [[ -z "$SDKMANAGER" ]] && command -v brew >/dev/null 2>&1; then
    BREW_ANDROID_TOOLS="$(brew --prefix android-commandlinetools 2>/dev/null || true)"
    SDKMANAGER="$BREW_ANDROID_TOOLS/cmdline-tools/latest/bin/sdkmanager"
fi
if [[ ! -x "$SDKMANAGER" ]]; then
    echo "Android sdkmanager was not found. Install Android command-line tools and rerun." >&2
    exit 2
fi

# sdkmanager's macOS launcher does not quote JAVA_HOME while checking its
# version, so Android Studio's space-containing JBR path triggers a warning.
SDKMANAGER_JAVA_HOME="$JAVA_HOME"
if [[ "$SDKMANAGER_JAVA_HOME" == *" "* ]]; then
    ln -s "$SDKMANAGER_JAVA_HOME" "$TEMP_DIR/jdk"
    SDKMANAGER_JAVA_HOME="$TEMP_DIR/jdk"
fi

run_sdkmanager() {
    JAVA_HOME="$SDKMANAGER_JAVA_HOME" "$SDKMANAGER" "$@"
}

mkdir -p "$SDK_ROOT"
export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"

echo "Accepting Android SDK licenses..."
set +o pipefail
yes | run_sdkmanager --sdk_root="$SDK_ROOT" --licenses >/dev/null
LICENSE_STATUS=$?
set -o pipefail
if [[ "$LICENSE_STATUS" -ne 0 ]]; then
    echo "Android SDK licenses were not accepted." >&2
    exit "$LICENSE_STATUS"
fi

echo "Installing Android SDK packages..."
run_sdkmanager --sdk_root="$SDK_ROOT" \
    "platform-tools" \
    "platforms;android-37.0" \
    "build-tools;37.0.0" \
    "ndk;28.2.13676358" \
    "cmake;3.31.6"

printf 'sdk.dir=%s\n' "$SDK_ROOT" > "$ROOT/android/local.properties"

if [[ ! -f "$ROOT/android/gradle/wrapper/gradle-wrapper.jar" ]]; then
    GRADLE_ZIP="$TEMP_DIR/gradle-$GRADLE_VERSION-bin.zip"

    echo "Downloading Gradle $GRADLE_VERSION to generate the wrapper..."
    curl --fail --location --retry 3 \
        "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" \
        --output "$GRADLE_ZIP"
    unzip -q "$GRADLE_ZIP" -d "$TEMP_DIR"
    (
        cd "$ROOT/android"
        GRADLE_USER_HOME="$TEMP_DIR/gradle-user-home" \
            "$TEMP_DIR/gradle-$GRADLE_VERSION/bin/gradle" \
            --no-daemon wrapper --gradle-version "$GRADLE_VERSION"
    )
fi

cd "$ROOT"
bun install
bun run mobile:deps
bun run mobile:assets

echo
echo "Android command-line dependencies are ready."
echo "Build a debug APK with: ./scripts/package-android.sh apk debug"
