import { ComponentX } from '../core/ComponentX'
import { Sprite } from './Sprite'

export interface ProgressBarProps {
  spriteFrame?: string
  isVertical?: boolean
  fillRange?: number
  fillCenter?: Vec2
  isReverse?: boolean
}

export class ProgressBar extends ComponentX<ProgressBarProps> {
  min = 0
  max = 1
  private targetSprite: Sprite | null = null

  onAwake(): void {
    this.applyToSprite()
  }

  onStart(): void {
    this.applyToSprite()
  }

  setValue(value: number): this {
    this.fillRange = value
    return this
  }

  get fillRange(): number {
    return this.props.fillRange ?? this.max
  }

  set fillRange(value: number) {
    this.props.fillRange = Math.max(this.min, Math.min(this.max, value))
    this.applyToSprite()
  }

  get isVertical(): boolean {
    return this.props.isVertical ?? false
  }

  set isVertical(value: boolean) {
    this.props.isVertical = value
    this.applyToSprite()
  }

  get isReverse(): boolean {
    return this.props.isReverse ?? false
  }

  set isReverse(value: boolean) {
    this.props.isReverse = value
    this.applyToSprite()
  }

  onNodeReassigned(): void {
    this.targetSprite = null
    this.applyToSprite()
  }

  private applyToSprite(): void {
    if (!this.node) return
    const sprite = this.targetSprite ?? this.node.getComponent(Sprite)
    if (!sprite) return
    this.targetSprite = sprite
    sprite.setFill({
      fillRange: this.fillRange,
      isVertical: this.isVertical,
      isReverse: this.isReverse,
    })
  }
}
