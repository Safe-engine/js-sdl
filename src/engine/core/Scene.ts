import { Node } from "./Node";
import { InputSystem } from "../Input";

export type Orientation =
  | "unknown"
  | "landscape"
  | "landscape-flipped"
  | "portrait"
  | "portrait-flipped";

export class Scene {
  readonly name: string;
  readonly root: Node;
  readonly input: InputSystem;
  private _started = false;

  constructor(name: string = "Scene") {
    this.name = name;
    this.root = new Node("root");
    this.input = new InputSystem(this.root);
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
  onTouchStart(_x: number, _y: number): void {}

  /** Override: called while a pressed pointer moves. */
  onTouchMove(_x: number, _y: number): void {}

  /** Override: called when a pointer is released. */
  onTouchEnd(_x: number, _y: number): void {}

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
      this.root._startTree();
      this._started = true;
    }
    this.onUpdate(dt);
    this.root._updateTree(dt);
  }

  /** Engine-internal: render all. */
  render(): void {
    this.root._renderTree();
    this.onRender();
  }

  /** Engine-internal: dispatch a pointer press to components, then the scene. */
  _dispatchTouchStart(x: number, y: number): void {
    if (!this.input.dispatchStart(x, y)) this.onTouchStart(x, y);
  }

  /** Engine-internal: dispatch pointer movement to captured components. */
  _dispatchTouchMove(x: number, y: number): void {
    if (!this.input.dispatchMove(x, y)) this.onTouchMove(x, y);
  }

  /** Engine-internal: dispatch a pointer release to captured components. */
  _dispatchTouchEnd(x: number, y: number): void {
    if (!this.input.dispatchEnd(x, y)) this.onTouchEnd(x, y);
  }
}
