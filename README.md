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

### Mobile prerequisites

Mobile builds compile SDL3, SDL3_image, SDL3_ttf, and QuickJS from source:

```bash
bun run mobile:deps
bun run mobile:assets
```

Android requires Android Studio or command-line SDK tools with SDK 37,
NDK `28.2.13676358`, CMake `3.31.6`, JDK 17+, and Gradle 9.4.1. iOS
requires Xcode and an Apple Developer account for device/release signing.

### Android APK and AAB

Open `android/` in Android Studio, or build from the repository root:

```bash
# Debug APK (signed with the Android debug key)
./scripts/package-android.sh apk debug

# Release APK or Play Store bundle
bun run android:apk
bun run android:aab
```

Release output is written below `android/app/build/outputs/`. For signed release
packages, copy `android/keystore.properties.example` to
`android/keystore.properties`, create an upload keystore, and fill in its four
values:

```bash
keytool -genkeypair -v \
  -keystore android/release.keystore \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

The manifest requests only network access and OpenGL ES 2. Add camera,
microphone, notifications, or other permissions to
`android/app/src/main/AndroidManifest.xml` only when the game uses them.

### iOS Xcode and IPA

Generate the Xcode project:

```bash
bun run ios:project
open ios/xcode/SDL3Game.xcodeproj
```

Set your Apple team and export a release IPA:

```bash
export DEVELOPMENT_TEAM=ABCDE12345
bun run ios:ipa
```

The archive and IPA are written below `ios/build/`. The default
`ios/ExportOptions.plist` targets App Store Connect; change `method` to
`ad-hoc` or `development` when appropriate. Add privacy usage descriptions
such as `NSCameraUsageDescription` to `ios/Info.plist.in` before adding the
matching native capability.

### Branding and orientation

`bun run mobile:assets` generates the iOS app icon and launch images from
`scripts/generate-mobile-assets.mjs`. Android uses vector icon and splash
resources under `android/app/src/main/res/`. Both projects default to landscape;
change `android:screenOrientation` and the iOS orientation arrays if the game
supports portrait.

### Assets

`Sprite` and `Label` acquire cached native textures/fonts and release them when
their node is destroyed. Labels only rebuild their cached text texture when the
text or font changes.

```ts
import { AssetManager, TextureAtlas } from "./engine";

const group = AssetManager.createGroup()
  .addTexture("player", "res/Texture/player.png")
  .addFont("ui", "res/Font/LilitaOne-Regular.ttf", 24)
  .addAtlas("buttons", "res/Texture/button.png", {
    normal: { x: 0, y: 0, width: 220, height: 68 },
  });

group.preload(({ progress }) => {
  console.log(`Loading ${Math.round(progress * 100)}%`);
}).then(() => {
  console.log("Assets ready");

  const atlas = group.get<TextureAtlas>("buttons");
  if (!atlas) throw new Error("buttons atlas was not preloaded");
  sprite.setFrame(atlas, "normal");

  const sheet = AssetManager.acquireSpriteSheet(
    "res/Texture/player.png",
    32,
    32,
  );
  sprite.setFrame(sheet, "0");

  group.unload();
  sheet.release();
});
```

### Mobile lifecycle

Override lifecycle hooks on a scene. `onSaveProgress()` is called automatically
before the app enters the background and again if the OS terminates it.

```ts
class GameScene extends Scene {
  onPause(): void {
    audio.pause();
  }

  onResume(): void {
    audio.resume();
  }

  onSaveProgress(): void {
    saveGame(this.progress);
  }

  onLowMemory(): void {
    this.releaseOptionalCaches();
  }

  onOrientationChange(
    orientation: Orientation,
    width: number,
    height: number,
  ): void {
    this.layout(orientation, width, height);
  }
}
```

Scenes can also implement `onBackground()`, `onForeground()`, and
`onInterruption(active)` for finer control over mobile transitions.
