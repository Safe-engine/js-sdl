import { ComponentX } from '../core/ComponentX'
import type { InputEvent, Touch } from '../Input'

export interface TouchEventRegisterProps {
  onTouchStart?: (event: Touch) => void
  onTouchMove?: (event: Touch) => void
  onTouchEnd?: (event: Touch) => void
  consumeInput?: boolean
}

export class TouchEventRegister extends ComponentX<TouchEventRegisterProps> {
  inputEnabled = true

  hitTest(x: number, y: number): boolean {
    return this.containsPoint(x, y)
  }

  onPointerStart(event: InputEvent): void {
    this.props.onTouchStart?.(event)
    this.consume(event)
  }

  onPointerMove(event: InputEvent): void {
    this.props.onTouchMove?.(event)
    this.consume(event)
  }

  onPointerEnd(event: InputEvent): void {
    this.props.onTouchEnd?.(event)
    this.consume(event)
  }

  private consume(event: InputEvent): void {
    if (this.props.consumeInput ?? true) event.stopPropagation()
  }

  private containsPoint(x: number, y: number): boolean {
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
