import { Node } from "./Node";

export class Scene {
  readonly name: string;
  readonly root: Node;
  private _started = false;

  constructor(name: string = "Scene") {
    this.name = name;
    this.root = new Node("root");
  }

  /** Override: called once when scene starts. */
  onLoad(): void {}

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
}
