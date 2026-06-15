import {
  createWindow,
  onInit,
  onUpdate,
  onRender,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onPause,
  onResume,
  onBackground,
  onForeground,
  onInterruption,
  onLowMemory,
  onOrientationChange,
  onTerminate,
  clear,
  getViewportMetrics,
  present,
} from "sdl3";
import { Orientation, Scene } from "./core/Scene";
import { Point, Viewport } from "./Viewport";
import { Tween } from "./animation/Tween";
import { Audio } from "./Audio";

const ORIENTATIONS: Orientation[] = [
  "unknown",
  "landscape",
  "landscape-flipped",
  "portrait",
  "portrait-flipped",
];

class EngineImpl {
  readonly viewport = new Viewport();
  private _currentScene: Scene | null = null;
  private _initialized = false;
  private _ready = false;
  private _paused = false;
  private _backgrounded = false;
  private _interrupted = false;

  /** Create window and register main loop. */
  start(title: string, width: number, height: number): void {
    if (this._initialized) return;
    this._initialized = true;

    onInit(() => {
      createWindow(title, width, height);
      this.refreshViewport();
      this._ready = true;
      const scene = this._currentScene;
      if (scene) {
        this._activateScene(scene);
      }
    });

    onUpdate((dt: number) => {
      Audio._update(dt);
      if (!this._paused && !this._backgrounded && this._currentScene) {
        Tween.update(dt);
        this._currentScene.tick(dt);
      }
    });

    onRender(() => {
      clear();
      if (this._currentScene) {
        this._currentScene.render();
      }
      present();
    });

    onTouchStart((x: number, y: number) => {
      this._currentScene?._dispatchTouchStart(x, y);
    });

    onTouchMove((x: number, y: number) => {
      this._currentScene?._dispatchTouchMove(x, y);
    });

    onTouchEnd((x: number, y: number) => {
      this._currentScene?._dispatchTouchEnd(x, y);
    });

    onPause(() => {
      if (this._paused) return;
      this._paused = true;
      this._syncAudioLifecycle();
      this._currentScene?.onSaveProgress();
      this._currentScene?.onPause();
    });

    onResume(() => {
      if (!this._paused) return;
      this._paused = false;
      this._syncAudioLifecycle();
      this._currentScene?.onResume();
    });

    onBackground(() => {
      if (this._backgrounded) return;
      this._backgrounded = true;
      this._syncAudioLifecycle();
      this._currentScene?.onBackground();
    });

    onForeground(() => {
      if (!this._backgrounded) return;
      this._backgrounded = false;
      this._syncAudioLifecycle();
      this._currentScene?.onForeground();
    });

    onInterruption((active: boolean) => {
      this._interrupted = active;
      this._syncAudioLifecycle();
      this._currentScene?.onInterruption(active);
    });

    onLowMemory(() => {
      this._currentScene?.onLowMemory();
    });

    onOrientationChange((value: number, width: number, height: number) => {
      this.refreshViewport();
      const orientation = ORIENTATIONS[value] ?? "unknown";
      this._currentScene?.onOrientationChange(orientation, width, height);
    });

    onTerminate(() => {
      Audio.stopAll();
      this._currentScene?.onSaveProgress();
    });
  }

  /** Refresh screen, letterbox, and safe-area measurements from the platform. */
  refreshViewport(): void {
    this.viewport.update(getViewportMetrics());
  }

  /** Convert window/client coordinates into logical game coordinates. */
  screenToWorld(x: number, y: number): Point {
    return this.viewport.screenToWorld(x, y);
  }

  /** Convert logical game coordinates into window/client coordinates. */
  worldToScreen(x: number, y: number): Point {
    return this.viewport.worldToScreen(x, y);
  }

  /** Set active scene and destroy the scene it replaces. */
  get scene(): Scene | null {
    return this._currentScene;
  }

  set scene(s: Scene | null) {
    if (this._currentScene === s) return;

    const previous = this._currentScene;
    this._currentScene = s;

    if (previous) {
      Tween.stopAll();
      previous.input.reset();
      if (this._ready) {
        previous.onExit();
      }
      previous.onUnload();
      previous.root.destroy();
    }

    if (s && this._ready) {
      this._activateScene(s);
    }
  }

  private _activateScene(scene: Scene): void {
    scene.onLoad();
    if (this._currentScene === scene) {
      scene.onEnter();
    }
  }

  private _syncAudioLifecycle(): void {
    Audio._setLifecyclePaused(
      this._paused || this._backgrounded || this._interrupted,
    );
  }
}

/** Global engine singleton. */
export const Engine = new EngineImpl();
