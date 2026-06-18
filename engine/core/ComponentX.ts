import type { InputEvent } from "../Input";
import type { Node } from "./Node";
export interface BaseComponentProps<T> {
  $ref?: T
  $push?: T[]
  $refNode?: Node
  $pushNode?: Node[]
  children?: unknown
  node?: Partial<Node>
  // [$key: `$${string}`]: string
}
export type Constructor<T = any> = new (...args: any[]) => T;

export class ComponentX<Props = unknown> {
  props: Props = {} as any
  node: Node
  inputEnabled = false;
  inputPriority = 0;
  __view?()
  constructor(data?: BaseComponentProps<ComponentX> & Props) {
    this.init(data)
  }

  init(data?: Props) {
    if (data) {
      // console.log('constructor', this.constructor.name, data)
      Object.keys(data).forEach((key) => {
        this.props[key] = data[key]
      })
    }
  }

  addComponent<T extends ComponentX>(component: Constructor<T> | T, data?: ConstructorParameters<Constructor<T>>[0]): T {
    return this.node.addComponent(component, data);
  }

  onAwake(): void { }
  onStart(): void { }
  onUpdate(_dt: number): void { }
  onRender(): void { }
  onRenderEnd(): void { }
  onDestroy(): void { }

  hitTest(_x: number, _y: number): boolean {
    return false;
  }

  allowsDescendantInput(_x: number, _y: number): boolean {
    return true;
  }

  onPointerStart(_event: InputEvent): void { }
  onPointerMove(_event: InputEvent): void { }
  onPointerEnd(_event: InputEvent): void { }
}
