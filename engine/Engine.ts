import {
  clear,
  createWindow,
  getViewportMetrics,
  getRendererStats,
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
import { globalCommandBuffer } from './render/RenderCommandBuffer'
import { Audio } from './Audio'
import { Label } from './components/Label'
import { Node } from './core/Node'
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
  /** Root for nodes that must remain alive while scenes are replaced. */
  readonly persistentNode = new Node('persistent')
  private _currentScene: Scene | null = null
  /** Scene requested while a platform callback was running; `undefined` if none. */
  private _pendingScene: Scene | null | undefined = undefined
  private _dispatchDepth = 0
  private _ready = false
  private _paused = false
  private _backgrounded = false
  private _interrupted = false
  private _startPromise: Promise<void> | null = null
  private _persistentStarted = false
  private _statsLabel: Label | null = null
  private _statsUpdateElapsed = 0
  private _fps = 0
  private _frameTimeMs = 0

  /** Create window and register main loop. */
  start(
    title: string,
    width: number,
    height: number,
    resolutionPolicy: ResolutionPolicy = 'letterbox',
    canvasId: string = 'sdl-canvas',
  ): Promise<void> {
    if (this._startPromise) return this._startPromise

    this._startPromise = new Promise((resolve) => {
      onInit(() => {
        createWindow(title, width, height, resolutionPolicy, canvasId)
        this.refreshViewport()
        this._resizePersistentNode()
        this._ready = true
        const scene = this._currentScene
        if (scene) {
          this._resizeSceneToViewport(scene)
          this._activateScene(scene)
        }
        resolve()
      })
    })

    onUpdate(this._dispatch((dt: number) => {
      this._applyPendingScene()
      this._fps = dt > 0 ? 1 / dt : 60
      this._frameTimeMs = dt * 1000
      Audio._update(dt)
      if (!this._paused && !this._backgrounded && this._currentScene) {
        Tween.update(dt)
        this._currentScene.tick(dt)
      }
      this._tickPersistentNode(dt)
    }))

    onRender(this._dispatch(() => {
      clear()
      globalCommandBuffer.beginFrame()
      if (this._currentScene) {
        this._currentScene.render()
      }
      this.persistentNode._renderTree()
      globalCommandBuffer.submit()
      present()
    }))

    onTouchStart(this._dispatch((x: number, y: number) => {
      TextInput.handleGlobalPointerStart(x, y)
      this._currentScene?._dispatchTouchStart(x, y)
    }))

    onTouchMove(this._dispatch((x: number, y: number) => {
      this._currentScene?._dispatchTouchMove(x, y)
    }))

    onTouchEnd(this._dispatch((x: number, y: number) => {
      this._currentScene?._dispatchTouchEnd(x, y)
    }))

    onTextInput(this._dispatch((text: string) => {
      TextInput.handleTextInput(text)
      this._currentScene?.onTextInput(text)
    }))

    onKeyDown(this._dispatch((key: string) => {
      TextInput.handleKeyDown(key)
      this._currentScene?.onKeyDown(key)
    }))

    onKeyUp(this._dispatch((key: string) => {
      this._currentScene?.onKeyUp(key)
    }))

    onPause(this._dispatch(() => {
      if (this._paused) return
      this._paused = true
      this._syncAudioLifecycle()
      this._currentScene?.onSaveProgress()
      this._currentScene?.onPause()
    }))

    onResume(this._dispatch(() => {
      if (!this._paused) return
      this._paused = false
      this._syncAudioLifecycle()
      this._currentScene?.onResume()
    }))

    onBackground(this._dispatch(() => {
      if (this._backgrounded) return
      this._backgrounded = true
      this._syncAudioLifecycle()
      this._currentScene?.onBackground()
    }))

    onForeground(this._dispatch(() => {
      if (!this._backgrounded) return
      this._backgrounded = false
      this._syncAudioLifecycle()
      this._currentScene?.onForeground()
    }))

    onInterruption(this._dispatch((active: boolean) => {
      this._interrupted = active
      this._syncAudioLifecycle()
      this._currentScene?.onInterruption(active)
    }))

    onLowMemory(this._dispatch(() => {
      this._currentScene?.onLowMemory()
    }))

    onOrientationChange(this._dispatch((value: number, width: number, height: number) => {
      this.refreshViewport()
      if (this._currentScene) this._resizeSceneToViewport(this._currentScene)
      const orientation = ORIENTATIONS[value] ?? 'unknown'
      this._currentScene?.onOrientationChange(orientation, width, height)
    }))

    onTerminate(this._dispatch(() => {
      Audio.stopAll()
      this._currentScene?.onSaveProgress()
    }))

    return this._startPromise
  }

  /** Refresh screen, letterbox, and safe-area measurements from the platform. */
  refreshViewport(): void {
    this.viewport.update(getViewportMetrics())
    this._resizePersistentNode()
  }

  /** Add a node that remains alive when the active scene changes. */
  addPersistentNode(node: Node): Node {
    this.persistentNode.addChild(node)
    if (this._persistentStarted) node._startTree()
    return node
  }

  /** Show or hide the persistent FPS and draw-call overlay. */
  showStats(visible = true): void {
    if (!this._statsLabel) {
      const node = this.addPersistentNode(new Node('renderer-stats'))
      node.x = 12
      node.anchorX = 0
      node.anchorY = 1
      node.zIndex = Number.MAX_SAFE_INTEGER
      this._statsLabel = node.addComponent(Label, {
        string: 'FPS: 0\nFrame time: 0.0 ms\nGL verts: 0\nDraw calls: 0',
        size: 28,
        align: 'left',
        verticalAlign: 'top',
        outline: [{ r: 0, g: 0, b: 0, a: 255 }, 2],
      })
      this._positionStatsLabel()
    }
    this._statsLabel.node.visible = visible
  }

  /** Convert window/client coordinates into logical game coordinates. */
  screenToWorld(x: number, y: number): Point {
    return this.viewport.screenToWorld(x, y)
  }

  /** Convert logical game coordinates into window/client coordinates. */
  worldToScreen(x: number, y: number): Point {
    return this.viewport.worldToScreen(x, y)
  }

  /**
   * Set active scene and destroy the scene it replaces. When set from inside a
   * frame or input callback, the switch is deferred to the start of the next
   * update so the old scene is never destroyed while its code is running; the
   * getter keeps returning the old scene until then.
   */
  get scene(): Scene | null {
    return this._currentScene
  }

  set scene(s: Scene | null) {
    if (this._dispatchDepth > 0) {
      this._pendingScene = s
      return
    }
    this._replaceScene(s)
  }

  private _replaceScene(s: Scene | null): void {
    if (this._currentScene === s) return

    const previous = this._currentScene
    this._currentScene = s

    if (previous) {
      if (s) {
        s.node.width = previous.node.width
        s.node.height = previous.node.height
      }
      Tween.stopAll(this.persistentNode)
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

  private _applyPendingScene(): void {
    if (this._pendingScene === undefined) return
    const scene = this._pendingScene
    this._pendingScene = undefined
    this._replaceScene(scene)
  }

  /** Wrap a platform callback so scene changes made inside it are deferred. */
  private _dispatch<A extends unknown[]>(handler: (...args: A) => void): (...args: A) => void {
    return (...args: A) => {
      this._dispatchDepth++
      try {
        handler(...args)
      } finally {
        this._dispatchDepth--
      }
    }
  }

  private _resizeSceneToViewport(scene: Scene): void {
    scene.node.width = this.viewport.logicalWidth
    scene.node.height = this.viewport.logicalHeight
  }

  private _resizePersistentNode(): void {
    this.persistentNode.width = this.viewport.logicalWidth
    this.persistentNode.height = this.viewport.logicalHeight
    this._positionStatsLabel()
  }

  private _positionStatsLabel(): void {
    if (!this._statsLabel) return
    this._statsLabel.node.y = this.persistentNode.height - 12
  }

  private _tickPersistentNode(dt: number): void {
    if (!this._persistentStarted) {
      this.persistentNode._startTree()
      this._persistentStarted = true
    }
    this._statsUpdateElapsed += dt
    if (this._statsLabel && this._statsUpdateElapsed >= 0.25) {
      const { drawCalls, vertices } = getRendererStats()
      this._statsLabel.string = `FPS: ${Math.round(this._fps)}\nFrame time: ${this._frameTimeMs.toFixed(1)} ms\nGL verts: ${vertices}\nDraw calls: ${drawCalls}`
      this._statsUpdateElapsed = 0
    }
    this.persistentNode._updateTree(dt)
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
