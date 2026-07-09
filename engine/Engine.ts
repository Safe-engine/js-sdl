import {
  clear,
  createWindow,
  getViewportMetrics,
  onBackground,
  onForeground,
  onInit,
  onInterruption,
  onKeyDown,
  onKeyUp,
  onLowMemory,
  onOrientationChange,
  onPause,
  onRender,
  onResume,
  onTerminate,
  onTextInput,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  onUpdate,
  present,
} from 'sdl3'
import { Tween } from './animation/Tween'
import { Audio } from './Audio'
import { TextInput } from './components/TextInput'
import { setSceneActivator } from './core/instantiate'
import { Orientation, Scene } from './core/Scene'
import { ActiveViewport } from './Viewport'

const ORIENTATIONS: Orientation[] = [
  'unknown',
  'landscape',
  'landscape-flipped',
  'portrait',
  'portrait-flipped',
]

class EngineImpl {
  readonly viewport = ActiveViewport
  private _currentScene: Scene | null = null
  private _initialized = false
  private _ready = false
  private _paused = false
  private _backgrounded = false
  private _interrupted = false

  /** Create window and register main loop. */
  start(
    title: string,
    width: number,
    height: number,
    resolutionPolicy: ResolutionPolicy = 'letterbox',
  ): void {
    if (this._initialized) return
    this._initialized = true

    onInit(() => {
      createWindow(title, width, height, resolutionPolicy)
      this.refreshViewport()
      this._ready = true
      const scene = this._currentScene
      if (scene) {
        this._resizeSceneToViewport(scene)
        this._activateScene(scene)
      }
    })

    onUpdate((dt: number) => {
      Audio._update(dt)
      if (!this._paused && !this._backgrounded && this._currentScene) {
        Tween.update(dt)
        this._currentScene.tick(dt)
      }
    })

    onRender(() => {
      clear()
      if (this._currentScene) {
        this._currentScene.render()
      }
      present()
    })

    onTouchStart((x: number, y: number) => {
      TextInput.handleGlobalPointerStart(x, y)
      this._currentScene?._dispatchTouchStart(x, y)
    })

    onTouchMove((x: number, y: number) => {
      this._currentScene?._dispatchTouchMove(x, y)
    })

    onTouchEnd((x: number, y: number) => {
      this._currentScene?._dispatchTouchEnd(x, y)
    })

    onTextInput((text: string) => {
      TextInput.handleTextInput(text)
      this._currentScene?.onTextInput(text)
    })

    onKeyDown((key: string) => {
      TextInput.handleKeyDown(key)
      this._currentScene?.onKeyDown(key)
    })

    onKeyUp((key: string) => {
      this._currentScene?.onKeyUp(key)
    })

    onPause(() => {
      if (this._paused) return
      this._paused = true
      this._syncAudioLifecycle()
      this._currentScene?.onSaveProgress()
      this._currentScene?.onPause()
    })

    onResume(() => {
      if (!this._paused) return
      this._paused = false
      this._syncAudioLifecycle()
      this._currentScene?.onResume()
    })

    onBackground(() => {
      if (this._backgrounded) return
      this._backgrounded = true
      this._syncAudioLifecycle()
      this._currentScene?.onBackground()
    })

    onForeground(() => {
      if (!this._backgrounded) return
      this._backgrounded = false
      this._syncAudioLifecycle()
      this._currentScene?.onForeground()
    })

    onInterruption((active: boolean) => {
      this._interrupted = active
      this._syncAudioLifecycle()
      this._currentScene?.onInterruption(active)
    })

    onLowMemory(() => {
      this._currentScene?.onLowMemory()
    })

    onOrientationChange((value: number, width: number, height: number) => {
      this.refreshViewport()
      if (this._currentScene) this._resizeSceneToViewport(this._currentScene)
      const orientation = ORIENTATIONS[value] ?? 'unknown'
      this._currentScene?.onOrientationChange(orientation, width, height)
    })

    onTerminate(() => {
      Audio.stopAll()
      this._currentScene?.onSaveProgress()
    })
  }

  /** Refresh screen, letterbox, and safe-area measurements from the platform. */
  refreshViewport(): void {
    this.viewport.update(getViewportMetrics())
  }

  /** Convert window/client coordinates into logical game coordinates. */
  screenToWorld(x: number, y: number): Point {
    return this.viewport.screenToWorld(x, y)
  }

  /** Convert logical game coordinates into window/client coordinates. */
  worldToScreen(x: number, y: number): Point {
    return this.viewport.worldToScreen(x, y)
  }

  /** Set active scene and destroy the scene it replaces. */
  get scene(): Scene | null {
    return this._currentScene
  }

  set scene(s: Scene | null) {
    if (this._currentScene === s) return

    const previous = this._currentScene
    this._currentScene = s

    if (previous) {
      if (s) {
        s.node.width = previous.node.width
        s.node.height = previous.node.height
      }
      Tween.stopAll()
      previous.input.reset()
      if (this._ready) {
        previous.onExit()
      }
      previous.onUnload()
      previous.node.destroy()
    }

    if (s && this._ready) {
      this._resizeSceneToViewport(s)
      this._activateScene(s)
    }
  }

  private _resizeSceneToViewport(scene: Scene): void {
    scene.node.width = this.viewport.logicalWidth
    scene.node.height = this.viewport.logicalHeight
  }

  private _activateScene(scene: Scene): void {
    scene.__view?.()
    scene.onLoad()
    if (this._currentScene === scene) {
      scene.onEnter()
    }
  }

  private _syncAudioLifecycle(): void {
    Audio._setLifecyclePaused(
      this._paused || this._backgrounded || this._interrupted,
    )
  }
}

/** Global engine singleton. */
export const Engine = new EngineImpl()

setSceneActivator((scene) => {
  Engine.scene = scene
})
