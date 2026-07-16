import { Sprite, SpriteProps } from './Sprite'

export interface ProgressBarProps extends SpriteProps {
  spriteFrame: string
  isVertical?: boolean
  fillRange?: number
  fillCenter?: Vec2
  isReverse?: boolean
}

export class ProgressBar extends Sprite<ProgressBarProps> {
  min = 0
  max = 1

  onAwake(): void {
    super.onAwake()
    this.applyToSprite()
  }

  onStart(): void {
    super.onStart()
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

  private applyToSprite(): void {
    this.setFill({
      fillRange: this.fillRange,
      isVertical: this.isVertical,
      isReverse: this.isReverse,
    })
  }
}
