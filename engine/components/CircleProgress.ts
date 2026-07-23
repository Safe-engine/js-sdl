import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import { spriteFrameCache } from '../SpriteFrameCache'
import { Sprite } from './Sprite'

export interface CircleProgressProps {
  spriteFrame?: string
  capInsets?: [number, number, number, number]
  tiled?: boolean
  min?: number
  max?: number
  value?: number
}

export class CircleProgress extends Sprite {
  min = 0
  max = 1
  value = 0

  constructor(data?: CircleProgressProps) {
    super(data as any)
  }

  onAwake(): void {
    super.onAwake()
    const props = this.props as CircleProgressProps
    this.min = props.min ?? this.min
    this.max = props.max ?? this.max
    this.setValue(props.value ?? this.value)
  }

  setRange(min: number, max: number): this {
    this.min = Math.min(min, max)
    this.max = Math.max(min, max)
    return this.setValue(this.value)
  }

  setValue(value: number): this {
    this.value = Math.max(this.min, Math.min(this.max, value))
    return this
  }

  onRender(): void {
    if (!this.node.visible || this.textureId < 0 || this.max <= this.min) return

    const ratio = (this.value - this.min) / (this.max - this.min)
    if (ratio <= 0) return

    const textureWidth = this.texture?.width ?? 0
    const textureHeight = this.texture?.height ?? 0
    if (textureWidth <= 0 || textureHeight <= 0) return

    const frame = this.atlas?.getFrame(this.frameName)
      ?? spriteFrameCache.get(this.spriteFrame ?? '')?.region
    const sourceX = frame?.x ?? 0
    const sourceY = frame?.y ?? 0
    const sourceWidth = frame?.width ?? textureWidth
    const sourceHeight = frame?.height ?? textureHeight
    const segments = Math.max(1, Math.ceil(ratio * 64))
    const center = this.pointAt(0.5, 0.5)
    const centerUv = this.uvAt(0.5, 0.5, sourceX, sourceY, sourceWidth, sourceHeight,
      textureWidth, textureHeight)
    const alpha = this.node.opacity * (this.node.color.a ?? 255)

    for (let i = 0; i < segments; i++) {
      const start = -Math.PI * 0.5 + i / segments * ratio * Math.PI * 2
      const end = -Math.PI * 0.5 + (i + 1) / segments * ratio * Math.PI * 2
      const first = this.pointAt(0.5 + Math.cos(start) * 0.5, 0.5 + Math.sin(start) * 0.5)
      const second = this.pointAt(0.5 + Math.cos(end) * 0.5, 0.5 + Math.sin(end) * 0.5)
      const firstUv = this.uvAt(0.5 + Math.cos(start) * 0.5, 0.5 + Math.sin(start) * 0.5,
        sourceX, sourceY, sourceWidth, sourceHeight, textureWidth, textureHeight)
      const secondUv = this.uvAt(0.5 + Math.cos(end) * 0.5, 0.5 + Math.sin(end) * 0.5,
        sourceX, sourceY, sourceWidth, sourceHeight, textureWidth, textureHeight)
      globalCommandBuffer.pushQuad(
        this.textureId,
        center.x, center.y, centerUv.u, centerUv.v,
        first.x, first.y, firstUv.u, firstUv.v,
        second.x, second.y, secondUv.u, secondUv.v,
        second.x, second.y, secondUv.u, secondUv.v,
        this.node.color.r, this.node.color.g, this.node.color.b, alpha,
      )
    }
  }

  private pointAt(x: number, y: number): Point {
    return this.node.localToWorld(
      (x - this.node.anchorX) * this.node.width,
      (y - this.node.anchorY) * this.node.height,
    )
  }

  private uvAt(
    x: number,
    y: number,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    textureWidth: number,
    textureHeight: number,
  ): { u: number, v: number } {
    const sourceU = this.node.flipX ? 1 - x : x
    const sourceV = this.node.flipY ? 1 - y : y
    return {
      u: (sourceX + sourceU * sourceWidth) / textureWidth,
      v: (sourceY + sourceV * sourceHeight) / textureHeight,
    }
  }
}
