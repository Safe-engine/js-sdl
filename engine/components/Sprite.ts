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
  tiledSize?: Size
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

  get tiledSize(): Size | undefined {
    return this.props.tiledSize
  }

  set tiledSize(size: Size | undefined) {
    this.props.tiledSize = size
    this.applyTiledSize()
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
    const tiledSize = this.props.tiledSize
    const baseWidth = tiledSize?.width
      ?? (this.isSharedNode() ? naturalWidth : this.node.width || naturalWidth)
    const baseHeight = tiledSize?.height
      ?? (this.isSharedNode() ? naturalHeight : this.node.height || naturalHeight)
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
    if (tiledSize) {
      const source = frame ?? {
        x: 0,
        y: 0,
        width: this.texture?.width ?? naturalWidth,
        height: this.texture?.height ?? naturalHeight,
      }
      this.drawTiledRegion(source, dx, dy, w, h)
      return
    }
    if (this.props.capInsets) {
      const source = frame ?? {
        x: 0,
        y: 0,
        width: this.texture?.width ?? naturalWidth,
        height: this.texture?.height ?? naturalHeight,
      }
      this.drawSlicedRegion(source, dx, dy, w, h)
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

    if (this.applyTiledSize()) return

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

  private applyTiledSize(): boolean {
    const size = this.props.tiledSize
    if (!size || this.isSharedNode()) return false
    if (size.width > 0 && (this.node.width === DEFAULT_NODE_WIDTH || this.node.width === this.autoWidth)) {
      this.node.width = size.width
      this.autoWidth = size.width
    }
    if (size.height > 0 && (this.node.height === DEFAULT_NODE_HEIGHT || this.node.height === this.autoHeight)) {
      this.node.height = size.height
      this.autoHeight = size.height
    }
    return true
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

  private drawTiledRegion(
    source: SpriteFrameRegion,
    dx: number,
    dy: number,
    w: number,
    h: number,
  ): void {
    if (source.width < 32 || source.height < 32 || w < 32 || h < 32) {
      console.warn('Tiled region is too small (<32px) to tile, rendering as a single texture instead.')
      return
    }

    const t = this.node
    const opacity = this.node.opacity * (this.node.color.a ?? 255)
    const tileWidth = source.width * t.worldScaleX
    const tileHeight = source.height * t.worldScaleY
    if (tileWidth <= 0 || tileHeight <= 0) return

    for (let y = 0; y < h; y += tileHeight) {
      const drawHeight = Math.min(tileHeight, h - y)
      const sourceHeight = source.height * (drawHeight / tileHeight)
      for (let x = 0; x < w; x += tileWidth) {
        const drawWidth = Math.min(tileWidth, w - x)
        const sourceWidth = source.width * (drawWidth / tileWidth)
        drawTextureRegionRotated(
          this.textureId,
          source.x, source.y, sourceWidth, sourceHeight,
          dx + x, dy + y, drawWidth, drawHeight,
          t.worldRotation,
          t.anchorX * w - x,
          t.anchorY * h - y,
          this.node.flipX, this.node.flipY,
          this.node.color.r, this.node.color.g, this.node.color.b,
          opacity,
        )
      }
    }
  }

  private drawSlicedRegion(
    source: SpriteFrameRegion,
    dx: number,
    dy: number,
    w: number,
    h: number,
  ): void {
    const capInsets = this.props.capInsets
    if (!capInsets || source.width <= 0 || source.height <= 0 || w <= 0 || h <= 0) return

    const t = this.node
    const [top, right, bottom, left] = capInsets
    const sourceLeft = Math.max(0, left)
    const sourceRight = Math.max(0, right)
    const sourceTop = Math.max(0, top)
    const sourceBottom = Math.max(0, bottom)
    const [leftSource, centerSourceWidth, rightSource] = this.splitInsets(source.width, sourceLeft, sourceRight)
    const [topSource, centerSourceHeight, bottomSource] = this.splitInsets(source.height, sourceTop, sourceBottom)
    const [leftDest, centerDestWidth, rightDest] = this.splitInsets(w, sourceLeft * t.worldScaleX, sourceRight * t.worldScaleX)
    const [topDest, centerDestHeight, bottomDest] = this.splitInsets(h, sourceTop * t.worldScaleY, sourceBottom * t.worldScaleY)
    const sourceColumns = [leftSource, centerSourceWidth, rightSource]
    const sourceRows = [topSource, centerSourceHeight, bottomSource]
    const destColumns = [leftDest, centerDestWidth, rightDest]
    const destRows = [topDest, centerDestHeight, bottomDest]
    const opacity = this.node.opacity * (this.node.color.a ?? 255)

    let destY = dy
    let sourceY = source.y
    for (let row = 0; row < 3; row++) {
      const sourceHeight = sourceRows[row]
      const destHeight = destRows[row]
      let destX = dx
      let sourceX = source.x
      for (let column = 0; column < 3; column++) {
        const sourceWidth = sourceColumns[column]
        const destWidth = destColumns[column]
        if (sourceWidth > 0 && sourceHeight > 0 && destWidth > 0 && destHeight > 0) {
          drawTextureRegionRotated(
            this.textureId,
            sourceX, sourceY, sourceWidth, sourceHeight,
            destX, destY, destWidth, destHeight,
            t.worldRotation,
            t.anchorX * w - (destX - dx),
            t.anchorY * h - (destY - dy),
            this.node.flipX, this.node.flipY,
            this.node.color.r, this.node.color.g, this.node.color.b,
            opacity,
          )
        }
        sourceX += sourceWidth
        destX += destWidth
      }
      sourceY += sourceHeight
      destY += destHeight
    }
  }

  private splitInsets(size: number, start: number, end: number): [number, number, number] {
    const safeStart = Math.max(0, start)
    const safeEnd = Math.max(0, end)
    const total = safeStart + safeEnd
    if (total <= size) return [safeStart, size - total, safeEnd]
    if (total <= 0) return [0, size, 0]
    const scale = size / total
    return [safeStart * scale, 0, safeEnd * scale]
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
