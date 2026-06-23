import { ComponentX } from "./ComponentX";

type Constructor<T = any> = new (...args: any[]) => T;
type ComponentInput<T extends ComponentX> = Constructor<T> | T;

export class Node {
  readonly name: string;
  parent: Node | null = null;
  children: Node[] = [];
  components: ComponentX[] = [];
  active = true;
  width = 64;
  height = 64;
  flipX = false;
  flipY = false;
  visible = true;
  opacity = 1;
  color: Color = { r: 255, g: 255, b: 255, a: 255 };

  x = 0;
  y = 0;
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  anchorX = 0.5;
  anchorY = 0.5;
  constructor(name?: string) {
    this.name = name;
  }

  get worldX(): number {
    const pt = this._getParentTransform();
    if (!pt) return this.x;

    const radians = pt.worldRotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = this.x * pt.worldScaleX;
    const y = this.y * pt.worldScaleY;
    return pt.worldX + x * cos - y * sin;
  }

  get worldY(): number {
    const pt = this._getParentTransform();
    if (!pt) return this.y;

    const radians = pt.worldRotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = this.x * pt.worldScaleX;
    const y = this.y * pt.worldScaleY;
    return pt.worldY + x * sin + y * cos;
  }

  get worldRotation(): number {
    const pt = this._getParentTransform();
    return (pt?.worldRotation ?? 0) + this.rotation;
  }

  get worldScaleX(): number {
    const pt = this._getParentTransform();
    return (pt?.worldScaleX ?? 1) * this.scaleX;
  }

  get worldScaleY(): number {
    const pt = this._getParentTransform();
    return (pt?.worldScaleY ?? 1) * this.scaleY;
  }

  private _getParentTransform() {
    const p = this.parent ?? null;
    return p;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  set scale(sx: number) {
    this.scaleX = sx;
    this.scaleY = sx;
  }

  addComponent<T extends ComponentX>(c: ComponentInput<T>, data?: ConstructorParameters<Constructor<T>>[0]): T {
    const component = typeof c === "function" ? new c(data) : c;
    if (component.node && component.node !== this) {
      component.node.components = component.node.components.filter((item) => item !== component);
    }
    component.node = this;
    if (!this.components.includes(component)) {
      this.components.push(component);
    }
    component.onAwake();
    return component;
  }

  resolveComponent<T extends ComponentX>(component: T): T {
    return this.addComponent(component);
  }

  getComponent<T extends ComponentX>(type: Constructor<T>): T | null {
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
