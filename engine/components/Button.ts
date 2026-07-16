import { InputEvent } from '../Input'
import { Sprite, SpriteProps } from './Sprite'

export interface ButtonProps extends SpriteProps {
  spriteFrame: string
  selectedImage?: string
  disableImage?: string
  zoomScale?: number
  onPress?: (target?: Button) => void
}
export class Button extends Sprite<ButtonProps> {
  inputEnabled = true
  consumeInput = true

  private pressed = false

  onPointerStart(event: InputEvent): void {
    this.pressed = true
    if (this.consumeInput) event.stopPropagation()
  }

  onPointerMove(event: InputEvent): void {
    if (this.consumeInput) event.stopPropagation()
  }

  onPointerEnd(event: InputEvent): void {
    if (this.pressed && this.containsPoint(event.x, event.y)) {
      this.props.onPress?.(this)
    }
    this.pressed = false
    if (this.consumeInput) event.stopPropagation()
  }

  hitTest(x: number, y: number): boolean {
    return this.containsPoint(x, y)
  }

  /** @deprecated Input is dispatched automatically by the active scene. */
  handleTouchStart(x: number, y: number): void {
    this.pressed = this.containsPoint(x, y)
  }

  /** @deprecated Input is dispatched automatically by the active scene. */
  handleTouchEnd(x: number, y: number): void {
    if (this.pressed && this.containsPoint(x, y)) {
      this.props.onPress?.(this)
    }
    this.pressed = false
  }

  containsPoint(x: number, y: number): boolean {
    const node = this.node
    if (!node) return false

    const radians = -node.worldRotation * Math.PI / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const dx = x - node.worldX
    const dy = y - node.worldY
    const localX = (dx * cos - dy * sin) / node.worldScaleX
    const localY = (dx * sin + dy * cos) / node.worldScaleY
    const left = -node.anchorX * node.width
    const top = -node.anchorY * node.height

    return (
      localX >= left
      && localX <= left + node.width
      && localY >= top
      && localY <= top + node.height
    )
  }
}
