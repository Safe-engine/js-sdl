import { ComponentX } from '../core/ComponentX'
import { ActiveViewport } from '../Viewport'

export interface WidgetProps {
  top?: Integer
  right?: Integer
  bottom?: Integer
  left?: Integer
  centerVertical?: boolean
  centerHorizon?: boolean
  inSafeArea?: boolean
}

export class Widget extends ComponentX<WidgetProps> {
  top: number | null = null
  right: number | null = null
  bottom: number | null = null
  left: number | null = null
  centerVertical = false
  centerHorizon = false
  inSafeArea = true

  onAwake(): void {
    this.top = normalizeInset(this.props.top)
    this.right = normalizeInset(this.props.right)
    this.bottom = normalizeInset(this.props.bottom)
    this.left = normalizeInset(this.props.left)
    this.centerVertical = this.props.centerVertical ?? false
    this.centerHorizon = this.props.centerHorizon ?? false
    this.inSafeArea = this.props.inSafeArea ?? true
  }

  onUpdate(_dt: number): void {
    this.applyViewportInsets()
  }

  setInsets(insets: WidgetProps): this {
    if (insets.top !== undefined) this.top = normalizeInset(insets.top)
    if (insets.right !== undefined) this.right = normalizeInset(insets.right)
    if (insets.bottom !== undefined) this.bottom = normalizeInset(insets.bottom)
    if (insets.left !== undefined) this.left = normalizeInset(insets.left)
    if (insets.centerVertical !== undefined) this.centerVertical = insets.centerVertical
    if (insets.centerHorizon !== undefined) this.centerHorizon = insets.centerHorizon
    if (insets.inSafeArea !== undefined) this.inSafeArea = insets.inSafeArea
    return this
  }

  private applyViewportInsets(): void {
    if (!this.node) return

    const area = this.inSafeArea
      ? ActiveViewport.safeArea
      : { x: 0, y: 0, width: ActiveViewport.logicalWidth, height: ActiveViewport.logicalHeight }
    const transform = this.node
    const hasLeft = this.left !== null
    const hasRight = this.right !== null
    const hasTop = this.top !== null
    const hasBottom = this.bottom !== null

    if (hasLeft && hasRight) {
      this.node.width = Math.max(0, area.width - this.left! - this.right!)
    }
    if (hasTop && hasBottom) {
      this.node.height = Math.max(0, area.height - this.top! - this.bottom!)
    }

    if (this.centerHorizon) {
      transform.x = area.x + area.width / 2
        + this.node.width * (transform.anchorX - 0.5)
    } else if (hasLeft) {
      transform.x = area.x + this.left! + this.node.width * transform.anchorX
    } else if (hasRight) {
      transform.x = area.x + area.width - this.right!
        - this.node.width * (1 - transform.anchorX)
    }

    if (this.centerVertical) {
      transform.y = area.y + area.height / 2
        + this.node.height * (transform.anchorY - 0.5)
    } else if (hasTop) {
      transform.y = area.y + this.top! + this.node.height * transform.anchorY
    } else if (hasBottom) {
      transform.y = area.y + area.height - this.bottom!
        - this.node.height * (1 - transform.anchorY)
    }
  }
}

function normalizeInset(value: number | undefined): number | null {
  return value === undefined ? null : value
}
