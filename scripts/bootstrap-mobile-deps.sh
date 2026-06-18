#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THIRD_PARTY="$ROOT/third_party"

mkdir -p "$THIRD_PARTY"

clone_dependency() {
    local directory="$1"
    local repository="$2"
    local revision="$3"

    if [[ -d "$THIRD_PARTY/$directory/.git" ]]; then
        echo "$directory already exists"
        return
    fi

    git clone --depth 1 --recursive --branch "$revision" \
        "$repository" "$THIRD_PARTY/$directory"
}

clone_dependency SDL \
    https://github.com/libsdl-org/SDL.git \
    "${SDL_REVISION:-main}"
clone_dependency SDL_image \
    https://github.com/libsdl-org/SDL_image.git \
    "${SDL_IMAGE_REVISION:-main}"
clone_dependency freetype \
    https://github.com/freetype/freetype.git \
    "${FREETYPE_REVISION:-master}"
clone_dependency quickjs \
    https://github.com/quickjs-ng/quickjs.git \
    "${QUICKJS_REVISION:-master}"
clone_dependency box2d \
    https://github.com/erincatto/box2d.git \
    "${BOX2D_REVISION:-main}"

echo "Mobile dependencies are ready in third_party/."
