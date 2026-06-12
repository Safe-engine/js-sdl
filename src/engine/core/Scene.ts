import { Node } from "./Node";
import { ECSManager } from "../ecs/ECSManager";

export class Scene {
  readonly name: string;
  readonly root: Node;
  ecs: ECSManager;
  private _started = false;

  constructor(name: string = "Scene") {
    this.name = name;
    this.root = new Node("root");
    this.ecs = new ECSManager();
  }

  /** Override: called once when scene starts. */
  onLoad(): void {}

  /** Override: called every frame before ECS. */
  onUpdate(_dt: number): void {}

  /** Override: called after all rendering. */
  onRender(): void {}

  /** Engine-internal: update all logic. */
  tick(dt: number): void {
    if (!this._started) {
      this.root._startTree();
      this._started = true;
    }
    this.onUpdate(dt);
    this.ecs.update(dt);
    this.root._updateTree(dt);
  }

  /** Engine-internal: render all. */
  render(): void {
    this.root._renderTree();
    this.onRender();
  }
}
