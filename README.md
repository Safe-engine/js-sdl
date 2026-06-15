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
