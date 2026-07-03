import {
  drawTextureRegionRotated,
  drawTextureRotated,
} from 'sdl3'
import {
  AssetManager,
  TextureAsset,
  TextureAtlas,
} from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '../core/Node'
import { SpriteFrameRegion, spriteFrameCache } from '../SpriteFrameCache'

interface SpriteProps {
  spriteFrame: string
  // type?: SpriteTypes
  capInsets?: [number, number, number, number]
  // tiledSize?: Size
}

export interface SpriteFillOptions {
  fillRange?: number
  isVertical?: boolean
  isReverse?: boolean
}

export class Sprite extends ComponentX<SpriteProps> {
  texturePath = ''
  textureId = -1
  atlas: TextureAtlas | null = null
  frameName = ''
  private texture: TextureAsset | null = null
  private loadedPath = ''
  private loadedAtlas: TextureAtlas | null = null
  private cachedFrame: SpriteFrameRegion | null = null
  private autoWidth = DEFAULT_NODE_WIDTH
  private autoHeight = DEFAULT_NODE_HEIGHT
  private naturalWidth = 0
  private naturalHeight = 0
  private fillRange = 1
  private fillVertical = false
  private fillReverse = false

  onAwake(): void {
    if (this.props.spriteFrame) {
      this.setTexture(this.props.spriteFrame)
    }
  }

  onStart(): void {
    this.ensureTexture()
  }

  get spriteFrame() {
    return this.props.spriteFrame
  }

  set spriteFrame(frameString: string) {
    this.props.spriteFrame = frameString
    this.setTexture(frameString)
  }

  setTexture(path: string): this {
    if (this.texturePath === path && !this.atlas) return this
    this.releaseTexture()
    this.atlas = null
    this.frameName = ''
    this.texturePath = path
    this.ensureTexture()
    return this
  }

  setFrame(atlas: TextureAtlas, frameName: string): this {
    this.releaseTexture()
    this.atlas = atlas
    this.frameName = frameName
    this.ensureTexture()
    return this
  }

  setFill(options: SpriteFillOptions): this {
    if (options.fillRange !== undefined) {
      this.fillRange = Math.max(0, Math.min(1, options.fillRange))
    }
    if (options.isVertical !== undefined) {
      this.fillVertical = options.isVertical
    }
    if (options.isReverse !== undefined) {
      this.fillReverse = options.isReverse
    }
    return this
  }

  onRender(): void {
    this.ensureTexture()
    if (!this.node.visible || this.textureId < 0) return
    const t = this.node
    if (!t) return

    const frame = this.getFrame()
    const naturalWidth = this.naturalWidth || frame?.width || this.texture?.width || 0
    const naturalHeight = this.naturalHeight || frame?.height || this.texture?.height || 0
    const baseWidth = this.isSharedNode() ? naturalWidth : this.node.width || naturalWidth
    const baseHeight = this.isSharedNode() ? naturalHeight : this.node.height || naturalHeight
    const w = baseWidth * t.worldScaleX
    const h = baseHeight * t.worldScaleY
    const dx = t.worldX - t.anchorX * w
    const dy = t.worldY - t.anchorY * h
    if (this.fillRange <= 0) return
    if (this.fillRange < 1) {
      const source = frame ?? {
        x: 0,
        y: 0,
        width: this.texture?.width ?? naturalWidth,
        height: this.texture?.height ?? naturalHeight,
      }
      this.drawFilledRegion(source, dx, dy, w, h)
      return
    }
    if (frame) {
      this.drawFrame(frame, w, h)
      return
    }

    drawTextureRotated(
      this.textureId,
      dx, dy,
      w, h,
      t.worldRotation,
      t.anchorX * w,
      t.anchorY * h,
      this.node.flipX,
      this.node.flipY,
      this.node.color.r,
      this.node.color.g,
      this.node.color.b,
      this.node.opacity * (this.node.color.a ?? 255),
    )
  }

  onDestroy(): void {
    this.releaseTexture()
  }

  private ensureTexture(): void {
    if (this.atlas) {
      if (this.texture && this.loadedAtlas === this.atlas) {
        const frame = this.getFrame()
        this.applyNaturalSize(frame?.width ?? this.texture.width,
          frame?.height ?? this.texture.height)
        return
      }
      this.releaseTexture()
      this.texture = AssetManager.acquireTexture(this.atlas.texture.key)
      this.loadedAtlas = this.atlas
      this.cachedFrame = null
      this.textureId = this.texture.id
      const frame = this.getFrame()
      this.applyNaturalSize(frame?.width ?? this.texture.width,
        frame?.height ?? this.texture.height)
      return
    }
    if (!this.texturePath) {
      this.releaseTexture()
      return
    }
    if (this.texture && this.loadedPath === this.texturePath) {
      this.applyNaturalSize(
        this.cachedFrame?.width ?? this.texture.width,
        this.cachedFrame?.height ?? this.texture.height,
      )
      return
    }
    this.releaseTexture()
    const spriteFrame = spriteFrameCache.get(this.texturePath)
    this.texture = AssetManager.acquireTexture(spriteFrame?.texturePath ?? this.texturePath)
    this.loadedPath = this.texturePath
    this.cachedFrame = spriteFrame?.region ?? null
    this.textureId = this.texture.id
    this.applyNaturalSize(
      this.cachedFrame?.width ?? this.texture.width,
      this.cachedFrame?.height ?? this.texture.height,
    )
  }

  private getFrame(): SpriteFrameRegion | null {
    return this.atlas?.getFrame(this.frameName) ?? this.cachedFrame
  }

  private applyNaturalSize(width: number, height: number): void {
    if (width > 0) this.naturalWidth = width
    if (height > 0) this.naturalHeight = height

    if (!this.isSharedNode() && width > 0 && (this.node.width === DEFAULT_NODE_WIDTH || this.node.width === this.autoWidth)) {
      this.node.width = width
      this.autoWidth = width
    }
    if (!this.isSharedNode() && height > 0 && (this.node.height === DEFAULT_NODE_HEIGHT || this.node.height === this.autoHeight)) {
      this.node.height = height
      this.autoHeight = height
    }
  }

  private isSharedNode(): boolean {
    return this.node.components[0] !== this
  }

  private drawFrame(
    frame: SpriteFrameRegion,
    width: number,
    height: number,
  ): void {
    const t = this.node
    const opacity = this.node.opacity * (this.node.color.a ?? 255)
    if (!frame.rotated) {
      drawTextureRegionRotated(
        this.textureId,
        frame.x, frame.y, frame.width, frame.height,
        t.worldX - t.anchorX * width,
        t.worldY - t.anchorY * height,
        width, height,
        t.worldRotation,
        t.anchorX * width,
        t.anchorY * height,
        this.node.flipX, this.node.flipY,
        this.node.color.r, this.node.color.g, this.node.color.b,
        opacity,
      )
      return
    }

    const drawWidth = height
    const drawHeight = width
    const centerX = height * (1 - t.anchorY)
    const centerY = width * t.anchorX
    drawTextureRegionRotated(
      this.textureId,
      frame.x, frame.y, frame.height, frame.width,
      t.worldX - centerX,
      t.worldY - centerY,
      drawWidth, drawHeight,
      t.worldRotation - 90,
      centerX,
      centerY,
      this.node.flipX, this.node.flipY,
      this.node.color.r, this.node.color.g, this.node.color.b,
      opacity,
    )
  }

  private drawFilledRegion(
    source: SpriteFrameRegion,
    dx: number,
    dy: number,
    w: number,
    h: number,
  ): void {
    const t = this.node
    let sourceX = source.x
    let sourceY = source.y
    let sourceWidth = source.width
    let sourceHeight = source.height
    let x = dx
    let y = dy
    let width = w
    let height = h

    if (this.fillVertical) {
      sourceHeight *= this.fillRange
      height *= this.fillRange
      if (this.fillReverse) {
        const sourceOffset = source.height - sourceHeight
        const destOffset = h - height
        sourceY += sourceOffset
        y += destOffset
      }
    } else {
      sourceWidth *= this.fillRange
      width *= this.fillRange
      if (this.fillReverse) {
        const sourceOffset = source.width - sourceWidth
        const destOffset = w - width
        sourceX += sourceOffset
        x += destOffset
      }
    }

    drawTextureRegionRotated(
      this.textureId,
      sourceX, sourceY, sourceWidth, sourceHeight,
      x, y, width, height,
      t.worldRotation,
      t.anchorX * w - (x - dx),
      t.anchorY * h - (y - dy),
      this.node.flipX, this.node.flipY,
      this.node.color.r, this.node.color.g, this.node.color.b,
      this.node.opacity * (this.node.color.a ?? 255),
    )
  }

  private releaseTexture(): void {
    this.texture?.release()
    this.texture = null
    this.loadedPath = ''
    this.loadedAtlas = null
    this.cachedFrame = null
    this.textureId = -1
  }
}
