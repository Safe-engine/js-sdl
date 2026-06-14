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
