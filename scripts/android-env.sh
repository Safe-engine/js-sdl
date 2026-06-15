#!/usr/bin/env bash

android_java_is_supported() {
    [[ -n "${JAVA_HOME:-}" ]] &&
        [[ -x "$JAVA_HOME/bin/java" ]] &&
        "$JAVA_HOME/bin/java" -version 2>&1 |
            grep -qE 'version "(17|18|19|2[0-9])'
}

if [[ "$(uname -s)" == "Darwin" ]]; then
    if ! android_java_is_supported; then
        if /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
            export JAVA_HOME
            JAVA_HOME="$(/usr/libexec/java_home -v 17)"
        elif command -v brew >/dev/null 2>&1 && brew --prefix openjdk@17 >/dev/null 2>&1; then
            export JAVA_HOME
            JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
        fi
    fi

    if [[ -z "${ANDROID_HOME:-}" ]]; then
        if [[ -d "$HOME/Library/Android/sdk" ]]; then
            export ANDROID_HOME="$HOME/Library/Android/sdk"
        elif command -v brew >/dev/null 2>&1 && brew --prefix android-commandlinetools >/dev/null 2>&1; then
            export ANDROID_HOME
            ANDROID_HOME="$(brew --prefix android-commandlinetools)"
        fi
    fi
fi

if [[ -n "${ANDROID_HOME:-}" ]]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
fi
