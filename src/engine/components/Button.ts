import { Component } from "../core/Component";
import { InputEvent } from "../Input";
import { Sprite } from "./Sprite";

export class Button extends Component {
  onClick: (() => void) | null = null;
  inputEnabled = true;
  consumeInput = true;

  private pressed = false;

  onPointerStart(event: InputEvent): void {
    this.pressed = true;
    if (this.consumeInput) event.stopPropagation();
  }

  onPointerMove(event: InputEvent): void {
    if (this.consumeInput) event.stopPropagation();
  }

  onPointerEnd(event: InputEvent): void {
    if (this.pressed && this.containsPoint(event.x, event.y)) {
      this.onClick?.();
    }
    this.pressed = false;
    if (this.consumeInput) event.stopPropagation();
  }

  hitTest(x: number, y: number): boolean {
    return this.containsPoint(x, y);
  }

  /** @deprecated Input is dispatched automatically by the active scene. */
  handleTouchStart(x: number, y: number): void {
    this.pressed = this.containsPoint(x, y);
  }

  /** @deprecated Input is dispatched automatically by the active scene. */
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
