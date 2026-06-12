import type { Node } from "./Node";

export class Component {
  node: Node | null = null;

  onAwake(): void {}
  onStart(): void {}
  onUpdate(_dt: number): void {}
  onRender(): void {}
  onDestroy(): void {}
}
