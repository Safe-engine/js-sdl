import { drawRect, drawTextureRegionRotated } from 'sdl3'
import { AssetManager, TextureAsset } from '../AssetManager'
import { UIElement } from './UI'

export interface ProgressBarProps {
  spriteFrame: string
  fillType?: number
  fillRange?: number
  fillCenter?: Vec2
  isReverse?: boolean
}

export class ProgressBar extends UIElement<ProgressBarProps> {
  min = 0
  max = 1
  vertical = false
  private texture: TextureAsset | null = null
  private loadedPath = ''

  setValue(value: number): this {
    this.props.fillRange = Math.max(this.min, Math.min(this.max, value))
    return this
  }

  setTexture(path: string): this {
    if (this.props.spriteFrame === path) return this
    this.releaseTexture()
    this.props.spriteFrame = path
    this.ensureTexture()
    return this
  }

  setFillType(fillType: number): this {
    this.props.fillType = fillType
    this.vertical = fillType === 1
    return this
  }

  onRender(): void {
    const rect = this.worldRect()
    const range = this.max - this.min
    const { fillRange = 0, isReverse, fillCenter = { x: 0, y: 0 } } = this.props
    const valueRatio = range <= 0
      ? 0
      : Math.max(0, Math.min(1, (fillRange - this.min) / range))
    const ratio = fillRange ?? valueRatio
    const width = this.vertical ? rect.width : rect.width * ratio
    const height = this.vertical ? rect.height * ratio : rect.height
    const x = isReverse && !this.vertical ? rect.x + rect.width - width : rect.x
    const y = isReverse && this.vertical ? rect.y + rect.height - height : rect.y

    this.ensureTexture()
    if (!this.texture) {
      drawRect(x, y, width, height,
        this.node.color.r, this.node.color.g, this.node.color.b,
        this.node.color.a ?? 255)
      return
    }

    if (width <= 0 || height <= 0) return

    const sourceWidth = this.vertical ? this.texture.width : this.texture.width * ratio
    const sourceHeight = this.vertical ? this.texture.height * ratio : this.texture.height
    const sourceX = isReverse && !this.vertical
      ? this.texture.width - sourceWidth
      : 0
    const sourceY = isReverse && this.vertical
      ? this.texture.height - sourceHeight
      : 0
    drawTextureRegionRotated(
      this.texture.id,
      sourceX, sourceY, sourceWidth, sourceHeight,
      x, y, width, height,
      this.node.worldRotation,
      fillCenter.x * width,
      fillCenter.y * height,
      false, false,
      this.node.color.r, this.node.color.g, this.node.color.b,
      this.node.color.a ?? 255,
    )
  }

  onDestroy(): void {
    this.releaseTexture()
  }

  private ensureTexture(): void {
    if (!this.props.spriteFrame) {
      this.releaseTexture()
      return
    }
    if (this.texture && this.loadedPath === this.props.spriteFrame) return
    this.releaseTexture()
    this.texture = AssetManager.acquireTexture(this.props.spriteFrame)
    this.loadedPath = this.props.spriteFrame
    this.applyNaturalSize(this.texture.width, this.texture.height)
  }

  private releaseTexture(): void {
    this.texture?.release()
    this.texture = null
    this.loadedPath = ''
  }

  private applyNaturalSize(width: number, height: number): void {
    if (width > 0 && this.node.width === 64) this.node.width = width
    if (height > 0 && this.node.height === 64) this.node.height = height
  }
}
