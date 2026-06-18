### Install on macOS (Homebrew)

```bash
brew install sdl3 sdl3_image sdl3_ttf box2d quickjs-ng
```

### Install on Windows (vcpkg)

```powershell
vcpkg install sdl3 sdl3-image sdl3_ttf box2d quickjs-ng --triplet x64-windows
# Then pass: -DCMAKE_TOOLCHAIN_FILE=<vcpkg>/scripts/buildsystems/vcpkg.cmake
```

### Build
- `cmake -S . -B build`
- `cmake -S . -B build -DENABLE_BOX2D=OFF`: Build without the native Box2D module:
- `cmake --build build --parallel && ./build/sdl3js`: Run

### Web

The browser build reuses the same engine and game code, replacing the native
`sdl3` module with the WebGL implementation in `web/sdl3.ts`.

```bash
bun run web:dev
```

Create a production build in `dist-web/` with:

```bash
bun run web:build
```

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

On macOS, install all Android command-line dependencies and generate the
Gradle wrapper with:

```bash
bun run android:setup
```

The setup command uses Homebrew to install JDK 17 and Android command-line
tools, then installs the required SDK, build-tools, NDK, and CMake packages.

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

Build, install, and launch the app in an available iPhone Simulator:

```bash
bun run ios:run
```

Set `IOS_SIMULATOR_UDID` to target a specific simulator, or set
`IOS_CONFIGURATION=Release` to run a release build.

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

### Audio

The global `Audio` manager provides music and sound-effect groups, mute and
volume controls, looping, fades, and pooled sound voices. Use WAV files for
assets that must work on native and web builds; browsers may support additional
formats, but native playback currently uses SDL's WAV loader.

```ts
import { Audio } from "./engine";

// Reuses up to six simultaneous voices instead of allocating unbounded sounds.
const laser = Audio.createSound("res/Audio/laser.wav", {
  group: "sfx",
  maxVoices: 6,
  volume: 0.8,
});

laser.play();
laser.play({ volume: 0.5 });

// Music loops by default. Fade times are measured in seconds.
Audio.playMusic("res/Audio/theme.wav", { fadeIn: 1.5 });
Audio.stopMusic(0.75);

Audio.group("master").volume = 0.9;
Audio.group("music").volume = 0.6;
Audio.group("sfx").muted = true;
Audio.group("music").fadeTo(0.25, 1);

const voice = Audio.play("res/Audio/impact.wav");
voice?.fadeOut(0.3);

laser.release();
```

`Audio.pause()` and `Audio.resume()` control all playback without changing
individual pause state. The engine also suspends audio automatically while the
application is paused, backgrounded, or interrupted, and resumes only after
all active lifecycle conditions have cleared.

### Scene lifecycle

When a scene becomes active, the engine calls `onLoad()` followed by `onEnter()`.
Replacing it calls `onExit()`, `onUnload()`, and then destroys its node tree.
`onPause()` and `onResume()` follow app inactivity without unloading the scene.

`onSaveProgress()` is called automatically before the app enters the background
and again if the OS terminates it.

```ts
class GameScene extends Scene {
  onSaveProgress(): void {
    saveGame(this.progress);
  }

  onLowMemory(): void {
    this.releaseOptionalCaches();
  }

  onUnload(): void {
    this.releaseSceneResources();
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

### Player persistence

`PersistenceJSON` stores settings and level progress as a versioned JSON save.
It uses the browser's `localStorage` by default and accepts any object with the
same `getItem`, `setItem`, and `removeItem` interface.

```ts
import { PersistenceJSON } from "./engine";

interface PlayerSave {
  settings: { musicVolume: number; soundVolume: number };
  progress: { unlockedLevel: number; highScores: Record<string, number> };
}

const playerSave = new PersistenceJSON<PlayerSave>("player", {
  version: 2,
  defaults: () => ({
    settings: { musicVolume: 1, soundVolume: 1 },
    progress: { unlockedLevel: 1, highScores: {} },
  }),
  migrations: {
    // Each migration upgrades version N to N + 1.
    1: (old: any) => ({
      ...old,
      progress: { ...old.progress, highScores: {} },
    }),
  },
});

const player = playerSave.load();
player.progress.unlockedLevel = 2;
playerSave.save(player);
```

Loading an older save runs every migration in order and immediately rewrites
the upgraded file. Invalid JSON, saves from newer app versions, and missing
migrations throw rather than silently replacing player progress.

### Resolution and safe areas

`Engine.start()` dimensions are the logical design resolution. Rendering keeps
that coordinate system at every window or device size, scales uniformly, and
letterboxes any remaining space. Browser rendering uses the device pixel ratio
for a sharp drawing buffer without changing game coordinates.

```ts
const { logicalWidth, logicalHeight, safeArea, safeInsets } = Engine.viewport;

// Place interactive UI inside the notch/system-bar-safe logical rectangle.
hud.transform.setPosition(
  safeArea.x + 24,
  safeArea.y + 24,
);

// Convert raw window/client coordinates when integrating a platform API.
const world = Engine.screenToWorld(clientX, clientY);
const insideGame = Engine.viewport.containsScreenPoint(clientX, clientY);
```

Scene touch callbacks already receive logical game coordinates. Use
`Engine.worldToScreen()` for overlays that live outside the SDL/WebGL renderer.

### Input dispatch

Interactive components receive pointer input automatically. `Button` performs
sprite hit testing, captures a press until release, and invokes `onClick`
without scene-level touch forwarding.

```ts
const button = node.addComponent(Button);
button.onClick = () => startGame();
button.inputPriority = 10;
```

Hit components are ordered by descending `inputPriority`. Equal priorities use
reverse render order, so the visually topmost component receives input first.
Calling `event.stopPropagation()` prevents lower-priority hit components and
the scene touch callback from receiving that event. Buttons do this by default;
set `button.consumeInput = false` to allow propagation.

### UI

UI components use the existing node tree and logical coordinate system.
`UIContainer` supports horizontal and vertical stack layout, padding, gaps,
cross-axis alignment, flexible children, and anchor constraints. `Panel`,
`UIImage`, `NineSlice`, `ProgressBar`, `Toggle`, and `ScrollView` provide the
standard retained widgets.

```ts
import {
  Label,
  Localization,
  Node,
  Panel,
  ProgressBar,
  Toggle,
  UIContainer,
  UIElement,
} from "./engine";

Localization.add("en", { status: "Energy: {value}%" });
Localization.add("vi", { status: "Năng lượng: {value}%" });
Localization.use("en");

const hud = new Node("hud");
const panel = hud.addComponent(Panel);
panel.setSize(520, 180);
panel.direction = "vertical";
panel.gap = 12;
panel.padding = { top: 20, right: 20, bottom: 20, left: 20 };

const titleNode = panel.node!.addChild(new Node("title"));
titleNode.addComponent(UIElement).setSize(480, 48);
const title = titleNode.addComponent(Label);
title.setFont("res/Font/LilitaOne-Regular.ttf", 30);
title.setLocalized("status", { value: 75 });
title.wrapWidth = 480;
title.align = "center";
title.outlineWidth = 2;

const progressNode = panel.node!.addChild(new Node("progress"));
const progress = progressNode.addComponent(ProgressBar);
progress.setSize(480, 24).setValue(0.75);

const toggleNode = panel.node!.addChild(new Node("sound"));
const toggle = toggleNode.addComponent(Toggle);
toggle.setSize(72, 36);
toggle.onChange = (enabled) => console.log("Sound", enabled);
```

Anchor values are normalized to the parent UI element. Equal minimum and
maximum anchors pin an element to a point; different values stretch it between
two points. Offsets then inset or move the anchored rectangle.

```ts
const child = new Node("full-size-child");
panel.node!.addChild(child);
const element = child.addComponent(UIElement);
element.setAnchors(0, 0, 1, 1);
element.offsetLeft = 16;
element.offsetTop = 16;
element.offsetRight = 16;
element.offsetBottom = 16;
```

`ScrollView` clips its descendants and uses its first child as the movable
content root. Set `contentWidth` and `contentHeight` to define scroll limits.
Labels support explicit newlines, word wrapping, horizontal and vertical
alignment, color, opacity, outlines, and localization keys.

### Tweening

Tweens use seconds and advance with engine time, so they pause automatically
when the app is paused or backgrounded. Numeric properties and nested colors
can be animated directly.

```ts
import { Easing, Tween } from "./engine";

Tween.to(
  player.transform,
  { x: 600, y: 240, rotation: 360, scaleX: 1.5, scaleY: 1.5 },
  0.8,
  {
    ease: Easing.cubicOut,
    delay: 0.1,
    onComplete: () => console.log("move complete"),
  },
);

Tween.sequence()
  .to(sprite, {
    opacity: 0.25,
    color: { r: 255, g: 96, b: 64 },
  }, 0.2, { ease: Easing.quadOut })
  .delay(0.15)
  .call(() => console.log("flash"))
  .to(sprite, {
    opacity: 1,
    color: { r: 255, g: 255, b: 255 },
  }, 0.3)
  .start();
```

Available callbacks are `onStart`, `onUpdate`, `onComplete`, and `onStop`.
Calling `stop()` on a tween or sequence cancels it. Scene changes cancel all
active tweens.
