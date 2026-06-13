### Install on macOS (Homebrew)

```bash
brew install sdl3 sdl3_image sdl3_ttf
```

### Install on Windows (vcpkg)

```powershell
vcpkg install sdl3 sdl3-image --triplet x64-windows
# Then pass: -DCMAKE_TOOLCHAIN_FILE=<vcpkg>/scripts/buildsystems/vcpkg.cmake
```

### Build
- `cmake -S . -B build`
- `cmake --build build --parallel && ./build/sdl3js`
