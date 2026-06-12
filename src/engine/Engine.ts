import { createWindow, onInit, onUpdate, onRender, clear, present } from "sdl3";
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
