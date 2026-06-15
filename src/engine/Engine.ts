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
  present,
} from "sdl3";
import { Orientation, Scene } from "./core/Scene";

const ORIENTATIONS: Orientation[] = [
  "unknown",
  "landscape",
  "landscape-flipped",
  "portrait",
  "portrait-flipped",
];

class EngineImpl {
  private _currentScene: Scene | null = null;
  private _initialized = false;
  private _ready = false;
  private _paused = false;
  private _backgrounded = false;

  /** Create window and register main loop. */
  start(title: string, width: number, height: number): void {
    if (this._initialized) return;
    this._initialized = true;

    onInit(() => {
      createWindow(title, width, height);
      this._ready = true;
      this._currentScene?.onLoad();
    });

    onUpdate((dt: number) => {
      if (!this._paused && !this._backgrounded && this._currentScene) {
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
      this._currentScene?.onTouchStart(x, y);
    });

    onTouchMove((x: number, y: number) => {
      this._currentScene?.onTouchMove(x, y);
    });

    onTouchEnd((x: number, y: number) => {
      this._currentScene?.onTouchEnd(x, y);
    });

    onPause(() => {
      if (this._paused) return;
      this._paused = true;
      this._currentScene?.onSaveProgress();
      this._currentScene?.onPause();
    });

    onResume(() => {
      if (!this._paused) return;
      this._paused = false;
      this._currentScene?.onResume();
    });

    onBackground(() => {
      if (this._backgrounded) return;
      this._backgrounded = true;
      this._currentScene?.onBackground();
    });

    onForeground(() => {
      if (!this._backgrounded) return;
      this._backgrounded = false;
      this._currentScene?.onForeground();
    });

    onInterruption((active: boolean) => {
      this._currentScene?.onInterruption(active);
    });

    onLowMemory(() => {
      this._currentScene?.onLowMemory();
    });

    onOrientationChange((value: number, width: number, height: number) => {
      const orientation = ORIENTATIONS[value] ?? "unknown";
      this._currentScene?.onOrientationChange(orientation, width, height);
    });

    onTerminate(() => {
      this._currentScene?.onSaveProgress();
    });
  }

  /** Set active scene (auto-calls onLoad). */
  get scene(): Scene | null {
    return this._currentScene;
  }

  set scene(s: Scene | null) {
    if (this._currentScene === s) return;
    this._currentScene?.root.destroy();
    this._currentScene = s;
    if (s && this._ready) {
      s.onLoad();
    }
  }
}

/** Global engine singleton. */
export const Engine = new EngineImpl();
