import {
  createWindow,
  onInit,
  onUpdate,
  onRender,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  clear,
  present,
} from "sdl3";
import { Scene } from "./core/Scene";

class EngineImpl {
  private _currentScene: Scene | null = null;
  private _initialized = false;

  /** Create window and register main loop. */
  start(title: string, width: number, height: number): void {
    if (this._initialized) return;
    this._initialized = true;

    onInit(() => {
      createWindow(title, width, height);
    });

    onUpdate((dt: number) => {
      if (this._currentScene) {
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
  }

  /** Set active scene (auto-calls onLoad). */
  get scene(): Scene | null {
    return this._currentScene;
  }

  set scene(s: Scene | null) {
    if (this._currentScene === s) return;
    this._currentScene = s;
    if (s) {
      s.onLoad();
    }
  }
}

/** Global engine singleton. */
export const Engine = new EngineImpl();
