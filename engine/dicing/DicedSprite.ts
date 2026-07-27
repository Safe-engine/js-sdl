import { AssetManager, type TextureAsset } from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { loadJsonAsset } from '../helper/resource-load'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'

export type Meta = {
  name: string
  rawWidth: number
  rawHeight: number
  cellW: number
  cellH: number
  atlasCols: number
  atlasRows: number
}

export type DicedAnimation = {
  name: string
  fps: number
  frames: number[][][]
}

export type DicedJSON = {
  meta: Meta
  animations: DicedAnimation[]
}

export interface DicedSpriteProps {
  texture: string
  animation: string
  data?: string | DicedJSON
}

export class DicedSprite extends ComponentX<DicedSpriteProps> {
  private texture: TextureAsset | null = null
  private atlas: DicedJSON | null = null
  private currentAnimation: DicedAnimation | null = null
  private elapsed = 0
  private frameIndex = 0
  private loadVersion = 0

  onStart(): void {
    void this.reload().catch((error) => {
      console.error('DicedSprite reload failed', error)
    })
  }

  onUpdate(dt: number): void {
    const animation = this.currentAnimation
    if (!animation || animation.frames.length < 2 || animation.fps <= 0) return

    this.elapsed += dt
    const frameDuration = 1 / animation.fps
    const framesElapsed = Math.floor(this.elapsed / frameDuration)
    if (framesElapsed === 0) return

    this.elapsed -= framesElapsed * frameDuration
    this.frameIndex = (this.frameIndex + framesElapsed) % animation.frames.length
  }

  onRender(): void {
    const atlas = this.atlas
    const texture = this.texture
    const animation = this.currentAnimation
    if (!this.node.visible || !atlas || !texture || !animation) return

    const frame = animation.frames[this.frameIndex]
    if (!frame) return

    const { meta } = atlas
    const node = this.node
    const scaleX = node.worldScaleX
    const scaleY = node.worldScaleY
    const rawWidth = meta.rawWidth * scaleX
    const rawHeight = meta.rawHeight * scaleY
    const originX = node.worldX - node.anchorX * rawWidth
    const originY = node.worldY - node.anchorY * rawHeight
    const cellWidth = meta.cellW * scaleX
    const cellHeight = meta.cellH * scaleY
    const opacity = node.opacity * (node.color.a ?? 255)

    for (let row = 0; row < frame.length; row++) {
      const cells = frame[row]
      for (let column = 0; column < cells.length; column++) {
        const cell = cells[column]
        if (cell < 0) continue

        const sourceColumn = cell % meta.atlasCols
        const sourceRow = Math.floor(cell / meta.atlasCols)
        const drawColumn = node.flipX ? cells.length - 1 - column : column
        const drawRow = node.flipY ? frame.length - 1 - row : row
        const x = originX + drawColumn * cellWidth
        const y = originY + drawRow * cellHeight
        const uvInset = 0.5

        globalCommandBuffer.pushRegion(
          texture.id,
          sourceColumn * meta.cellW + uvInset,
          sourceRow * meta.cellH + uvInset,
          meta.cellW - uvInset * 2,
          meta.cellH - uvInset * 2,
          x, y, cellWidth, cellHeight,
          node.worldRotation,
          node.worldX - x, node.worldY - y,
          node.flipX, node.flipY,
          node.color.r, node.color.g, node.color.b, opacity,
        )
      }
    }
  }

  onDestroy(): void {
    this.texture?.release()
    this.texture = null
  }

  async reload(): Promise<void> {
    const data = this.props.data
    if (!data || !this.props.texture) return

    const version = ++this.loadVersion
    const atlas = typeof data === 'string'
      ? await loadJsonAsset<DicedJSON>(data, 'diced sprite data')
      : data
    if (version !== this.loadVersion) return

    const animation = atlas.animations.find(({ name }) => name === this.props.animation)
    if (!animation) {
      throw new Error(`Diced animation not found: ${this.props.animation}`)
    }

    this.texture?.release()
    this.texture = AssetManager.acquireTexture(this.props.texture)
    this.atlas = atlas
    this.currentAnimation = animation
    this.elapsed = 0
    this.frameIndex = 0
    this.node.width = atlas.meta.rawWidth
    this.node.height = atlas.meta.rawHeight
  }
}
