import { InputSystem, Touch } from '../Input'
import { Node } from './Node'

export type Orientation
  = | 'unknown'
    | 'landscape'
    | 'landscape-flipped'
    | 'portrait'
    | 'portrait-flipped'

export interface SceneProps {
  children?: unknown
}

export class Scene {
  readonly name: string
  readonly node: Node
  readonly input: InputSystem
  private _started = false
  private _lastTouchX: number | null = null
  private _lastTouchY: number | null = null
  __view?(): void

  constructor(nameOrProps: string | SceneProps = 'Scene') {
    this.name = typeof nameOrProps === 'string' ? nameOrProps : 'Scene'
    this.node = new Node('root')
    this.node.anchorX = 0
    this.node.anchorY = 0
    this.input = new InputSystem(this.node)
  }

  /** Override: called once when scene starts. */
  onLoad(): void {}

  /** Override: called after the scene becomes active. */
  onEnter(): void {}

  /** Override: called before the scene stops being active. */
  onExit(): void {}

  /** Override: release scene resources before destruction. */
  onUnload(): void {}

  /** Override: called every frame before ECS. */
  onUpdate(_dt: number): void {}

  /** Override: called after all rendering. */
  onRender(): void {}

  /** Override: called when a pointer is pressed. */
  onTouchStart(_event: Touch): void {}

  /** Override: called while a pressed pointer moves. */
  onTouchMove(_event: Touch): void {}

  /** Override: called when a pointer is released. */
  onTouchEnd(_event: Touch): void {}

  /** Override: called when the platform emits committed text input. */
  onTextInput(_text: string): void {}

  /** Override: called when a physical key is pressed. */
  onKeyDown(_key: string): void {}

  /** Override: called when a physical key is released. */
  onKeyUp(_key: string): void {}

  /** Override: called when the app becomes inactive. */
  onPause(): void {}

  /** Override: called when the app becomes interactive again. */
  onResume(): void {}

  /** Override: called after the app enters the background. */
  onBackground(): void {}

  /** Override: called before the app returns to the foreground. */
  onForeground(): void {}

  /** Override: called when an OS interruption starts or ends. */
  onInterruption(_active: boolean): void {}

  /** Override: release optional caches when the OS reports memory pressure. */
  onLowMemory(): void {}

  /** Override: called after display orientation changes. */
  onOrientationChange(
    _orientation: Orientation,
    _width: number,
    _height: number,
  ): void {}

  /** Override: synchronously persist progress before background/termination. */
  onSaveProgress(): void {}

  /** Engine-internal: update all logic. */
  tick(dt: number): void {
    if (!this._started) {
      this.node._startTree()
      this._started = true
    }
    this.onUpdate(dt)
    this.node._updateTree(dt)
  }

  /** Engine-internal: render all. */
  render(): void {
    this.node._renderTree()
    this.onRender()
  }

  /** Engine-internal: dispatch a pointer press to components, then the scene. */
  _dispatchTouchStart(x: number, y: number): void {
    if (!this.input.dispatchStart(x, y)) {
      this._lastTouchX = x
      this._lastTouchY = y
      this.onTouchStart(new Touch('start', x, y, null))
    }
  }

  /** Engine-internal: dispatch pointer movement to captured components. */
  _dispatchTouchMove(x: number, y: number): void {
    if (!this.input.dispatchMove(x, y)) {
      const previousX = this._lastTouchX ?? x
      const previousY = this._lastTouchY ?? y
      this._lastTouchX = x
      this._lastTouchY = y
      this.onTouchMove(new Touch('move', x, y, null, previousX, previousY))
    }
  }

  /** Engine-internal: dispatch a pointer release to captured components. */
  _dispatchTouchEnd(x: number, y: number): void {
    if (!this.input.dispatchEnd(x, y)) {
      const previousX = this._lastTouchX ?? x
      const previousY = this._lastTouchY ?? y
      this.onTouchEnd(new Touch('end', x, y, null, previousX, previousY))
    }
    this._lastTouchX = null
    this._lastTouchY = null
  }
}
