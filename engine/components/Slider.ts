import { white } from '../helper/constants'
import type { InputEvent } from '../Input'
import { ComponentX } from '../core/ComponentX'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import { containsPoint, worldRect } from './UI'

export interface SliderProps {
  min?: number
  max?: number
  value?: number
  step?: number
  vertical?: boolean
  onChange?: (value: number, target: Slider) => void
}

export class Slider extends ComponentX<SliderProps> {
  min = 0
  max = 1
  value = 0
  step = 0
  vertical = false
  disabled = false
  trackColor: Color = { r: 71, g: 85, b: 105, a: 255 }
  fillColor: Color = { r: 59, g: 130, b: 246, a: 255 }
  thumbColor: Color = white()
  thumbSize = 0
  inputEnabled = true
  private dragging = false

  onAwake(): void {
    this.min = this.props.min ?? this.min
    this.max = this.props.max ?? this.max
    this.step = Math.max(0, this.props.step ?? this.step)
    this.vertical = this.props.vertical ?? this.vertical
    this.setValue(this.props.value ?? this.value)
  }

  hitTest(x: number, y: number): boolean {
    return !this.disabled && containsPoint(this.node, x, y)
  }

  onPointerStart(event: InputEvent): void {
    this.dragging = true
    this.updateFromPointer(event.x, event.y, true)
    event.stopPropagation()
  }

  onPointerMove(event: InputEvent): void {
    if (!this.dragging) return
    this.updateFromPointer(event.x, event.y, true)
    event.stopPropagation()
  }

  onPointerEnd(event: InputEvent): void {
    if (!this.dragging) return
    this.updateFromPointer(event.x, event.y, true)
    this.dragging = false
    event.stopPropagation()
  }

  setRange(min: number, max: number): this {
    this.min = Math.min(min, max)
    this.max = Math.max(min, max)
    return this.setValue(this.value)
  }

  setStep(step: number): this {
    this.step = Math.max(0, step)
    return this.setValue(this.value)
  }

  setValue(value: number, emit = false): this {
    const nextValue = this.normalizeValue(value)
    if (nextValue === this.value) return this
    this.value = nextValue
    if (emit) this.props.onChange?.(this.value, this)
    return this
  }

  onRender(): void {
    const rect = worldRect(this.node)
    const ratio = this.valueRatio()
    globalCommandBuffer.pushRect(rect.x, rect.y, rect.width, rect.height,
      this.trackColor.r, this.trackColor.g, this.trackColor.b,
      this.disabled ? 120 : this.trackColor.a ?? 255)

    if (this.vertical) {
      const fillHeight = rect.height * ratio
      globalCommandBuffer.pushRect(rect.x, rect.y + rect.height - fillHeight, rect.width, fillHeight,
        this.fillColor.r, this.fillColor.g, this.fillColor.b,
        this.disabled ? 160 : this.fillColor.a ?? 255)
    } else {
      const fillWidth = rect.width * ratio
      globalCommandBuffer.pushRect(rect.x, rect.y, fillWidth, rect.height,
        this.fillColor.r, this.fillColor.g, this.fillColor.b,
        this.disabled ? 160 : this.fillColor.a ?? 255)
    }

    const thumbExtent = Math.max(0, this.thumbSize)
      || Math.min(rect.width, rect.height)
    if (thumbExtent <= 0) return

    if (this.vertical) {
      const cy = rect.y + rect.height - rect.height * ratio
      const thumbHeight = Math.min(thumbExtent, rect.height)
      globalCommandBuffer.pushRect(rect.x, cy - thumbHeight * 0.5, rect.width, thumbHeight,
        this.thumbColor.r, this.thumbColor.g, this.thumbColor.b,
        this.disabled ? 180 : this.thumbColor.a ?? 255)
    } else {
      const cx = rect.x + rect.width * ratio
      const thumbWidth = Math.min(thumbExtent, rect.width)
      globalCommandBuffer.pushRect(cx - thumbWidth * 0.5, rect.y, thumbWidth, rect.height,
        this.thumbColor.r, this.thumbColor.g, this.thumbColor.b,
        this.disabled ? 180 : this.thumbColor.a ?? 255)
    }
  }

  private updateFromPointer(x: number, y: number, emit: boolean): void {
    const rect = worldRect(this.node)
    if (rect.width <= 0 || rect.height <= 0) return

    const ratio = this.vertical
      ? 1 - (y - rect.y) / rect.height
      : (x - rect.x) / rect.width
    const nextValue = this.min + (this.max - this.min) * ratio
    this.setValue(nextValue, emit)
  }

  private normalizeValue(value: number): number {
    if (this.max <= this.min) return this.min
    let nextValue = Math.max(this.min, Math.min(this.max, value))
    if (this.step > 0) {
      const steps = Math.round((nextValue - this.min) / this.step)
      nextValue = this.min + steps * this.step
      nextValue = Math.max(this.min, Math.min(this.max, nextValue))
    }
    return nextValue
  }

  private valueRatio(): number {
    const range = this.max - this.min
    if (range <= 0) return 0
    return (this.value - this.min) / range
  }
}
