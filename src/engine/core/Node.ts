import { Component } from "./Component";
import { Transform } from "./Transform";

type Constructor<T = any> = new (...args: any[]) => T;
export class Node {
  readonly name: string;
  parent: Node | null = null;
  children: Node[] = [];
  components: Component[] = [];
  active = true;

  constructor(name: string = "") {
    this.name = name;
    this.addComponent(Transform);
  }

  get transform(): Transform {
    return this.getComponent(Transform)!;
  }

  addComponent<T extends Component>(c: Constructor<T>): T {
    const component = new c();
    component.node = this;
    this.components.push(component);
    component.onAwake();
    return component;
  }

  getComponent<T extends Component>(type: Constructor<T>): T | null {
    for (const c of this.components) {
      if (c instanceof type) return c as T;
    }
    return null;
  }

  addChild(child: Node, index?: number): Node {
    if (child.parent) child.removeFromParent();
    child.parent = this;
    if (index !== undefined) {
      this.children.splice(index, 0, child);
    } else {
      this.children.push(child);
    }
    return child;
  }

  removeFromParent(): void {
    if (!this.parent) return;
    const idx = this.parent.children.indexOf(this);
    if (idx >= 0) this.parent.children.splice(idx, 1);
    this.parent = null;
  }

  /** Internal: traverse update through tree. */
  _updateTree(dt: number): void {
    if (!this.active) return;
    for (let i = 0; i < this.components.length; i++) {
      this.components[i].onUpdate(dt);
    }
    for (let i = 0; i < this.children.length; i++) {
      this.children[i]._updateTree(dt);
    }
  }

  /** Internal: traverse render through tree. */
  _renderTree(): void {
    if (!this.active) return;
    for (let i = 0; i < this.components.length; i++) {
      this.components[i].onRender();
    }
    for (let i = 0; i < this.children.length; i++) {
      this.children[i]._renderTree();
    }
    for (let i = this.components.length - 1; i >= 0; i--) {
      this.components[i].onRenderEnd();
    }
  }

  /** Internal: start all components (called once on first tick). */
  _startTree(): void {
    for (const c of this.components) c.onStart();
    for (const child of this.children) child._startTree();
  }

  destroy(): void {
    for (const c of this.components) c.onDestroy();
    for (const child of [...this.children]) child.destroy();
    this.removeFromParent();
    this.components.length = 0;
    this.children.length = 0;
  }
}
