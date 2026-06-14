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
    const width = sprite.width * transform.scaleX;
    const height = sprite.height * transform.scaleY;
    const left = transform.worldX - transform.anchorX * width;
    const top = transform.worldY - transform.anchorY * height;

    return (
      x >= left &&
      x <= left + width &&
      y >= top &&
      y <= top + height
    );
  }
}
