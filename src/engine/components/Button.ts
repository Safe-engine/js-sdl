import { Component } from "../core/Component";
import { Sprite } from "./Sprite";

export class Button extends Component {
  onClick: (() => void) | null = null;

  private pressed = false;

  handleTouchStart(x: number, y: number): void {
    this.pressed = this.containsPoint(x, y);
  }

  handleTouchEnd(x: number, y: number): void {
    if (this.pressed && this.containsPoint(x, y)) {
      this.onClick?.();
    }
    this.pressed = false;
  }

  containsPoint(x: number, y: number): boolean {
    const sprite = this.node!.getComponent(Sprite);
    if (!sprite) return false;

    const transform = this.node!.transform;
    const radians = -transform.worldRotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = x - transform.worldX;
    const dy = y - transform.worldY;
    const localX = (dx * cos - dy * sin) / transform.worldScaleX;
    const localY = (dx * sin + dy * cos) / transform.worldScaleY;
    const left = -transform.anchorX * sprite.width;
    const top = -transform.anchorY * sprite.height;

    return (
      localX >= left &&
      localX <= left + sprite.width &&
      localY >= top &&
      localY <= top + sprite.height
    );
  }
}
