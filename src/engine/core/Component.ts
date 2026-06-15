import type { Node } from "./Node";
import type { InputEvent } from "../Input";

export class Component {
  node: Node | null = null;
  inputEnabled = false;
  inputPriority = 0;

  onAwake(): void {}
  onStart(): void {}
  onUpdate(_dt: number): void {}
  onRender(): void {}
  onRenderEnd(): void {}
  onDestroy(): void {}

  hitTest(_x: number, _y: number): boolean {
    return false;
  }

  allowsDescendantInput(_x: number, _y: number): boolean {
    return true;
  }

  onPointerStart(_event: InputEvent): void {}
  onPointerMove(_event: InputEvent): void {}
  onPointerEnd(_event: InputEvent): void {}
}
