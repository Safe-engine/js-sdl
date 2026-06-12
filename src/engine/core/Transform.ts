import { Component } from "./Component";
import type { Node } from "./Node";

export class Transform extends Component {
  x = 0;
  y = 0;
  rotation = 0;
  scaleX = 1;
  scaleY = 1;
  anchorX = 0.5;
  anchorY = 0.5;

  get worldX(): number {
    if (!this.node?.parent) return this.x;
    const pt = this._getParentTransform();
    if (!pt) return this.x;
    return pt.worldX + this.x * pt.scaleX;
  }

  get worldY(): number {
    if (!this.node?.parent) return this.y;
    const pt = this._getParentTransform();
    if (!pt) return this.y;
    return pt.worldY + this.y * pt.scaleY;
  }

  private _getParentTransform(): Transform | null {
    const p = (this.node as Node | null)?.parent ?? null;
    if (!p) return null;
    for (const c of p.components) {
      if (c instanceof Transform) return c as Transform;
    }
    return null;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setScale(sx: number, sy: number): this {
    this.scaleX = sx;
    this.scaleY = sy;
    return this;
  }
}
