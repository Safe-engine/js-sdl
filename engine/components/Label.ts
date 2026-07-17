import { drawTextureRotated } from 'sdl3'
import {
  AssetManager,
  FontAsset,
  TextureAsset,
} from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, Node } from '../core/Node'
import { Localization } from '../Localization'

export type TextAlignment = 'left' | 'center' | 'right'
export type VerticalTextAlignment = 'top' | 'middle' | 'bottom'

interface LabelProps {
  font?: string
  string?: string
  size?: number
  align?: TextAlignment
  verticalAlign?: VerticalTextAlignment
  outline?: [Color, number]
  shadow?: [Color, number, Size]
  isAdaptWithSize?: boolean
}
export class Label extends ComponentX<LabelProps> {
  static defaultFont: string
  static defaultSize: Integer = 36
  text = ''
  localizationKey = ''
  localizationValues: Readonly<Record<string, string | number>> = {}
  fontPath = ''
  declare fontSize
  fontId = -1
  // outlineColor: Color = { r: 0, g: 0, b: 0, a: 255 }
  // outlineWidth = 0
  lineHeight = 1.2
  declare align: TextAlignment
  declare verticalAlign: VerticalTextAlignment
  private font: FontAsset | null = null
  private lineTextures: TextureAsset[] = []
  private lines: string[] = []
  private loadedSignature = ''
  private loadedFontKey = ''
  private localizationRevision = -1
  private autoWidth = 0
  private autoHeight = 0
  private naturalWidth = 0
  private naturalHeight = 0

  onAwake(): void {
    if (this.props.string !== undefined) {
      this.string = this.props.string
    }
    this.fontSize = this.props.size ?? Label.defaultSize
    this.setFont(this.props.font || Label.defaultFont, this.fontSize)
    this.align = this.props.align ?? 'center'
    this.verticalAlign = this.props.verticalAlign ?? 'middle'
  }

  onStart(): void {
    this.ensureAssets()
  }

  set string(text: string) {
    if (this.text === text && !this.localizationKey) return
    this.localizationKey = ''
    this.text = text
    this.releaseText()
  }

  setLocalized(
    key: string,
    values: Readonly<Record<string, string | number>> = {},
  ): this {
    this.localizationKey = key
    this.localizationValues = values
    this.localizationRevision = -1
    this.releaseText()
    return this
  }

  setFont(path: string, size: number): this {
    if (this.fontPath === path && this.fontSize === size) return this
    this.releaseAssets()
    this.fontPath = path
    this.fontSize = size
    return this
  }

  onUpdate(_dt: number): void {
    if (this.localizationKey
      && this.localizationRevision !== Localization.revision) {
      this.localizationRevision = Localization.revision
      this.releaseText()
    }
  }

  onRender(): void {
    this.ensureAssets()
    if (this.lineTextures.length === 0) return
    const t = this.node
    if (!t) return

    const { width: naturalWidth, height: textHeight } = this.measureText()
    const layoutWidth = this.isSharedNode()
      ? naturalWidth
      : this.node.width > 0 ? this.node.width : naturalWidth
    const layoutHeight = this.isSharedNode()
      ? textHeight
      : this.node.height > 0 ? this.node.height : textHeight
    const lineAdvance = this.fontSize * this.lineHeight
    let top = 0
    if (this.verticalAlign === 'middle') top = (layoutHeight - textHeight) * 0.5
    if (this.verticalAlign === 'bottom') top = layoutHeight - textHeight
    const renderOrigin = this.getRenderOrigin()

    for (let i = 0; i < this.lineTextures.length; i++) {
      const texture = this.lineTextures[i]
      let left = 0
      if (this.align === 'center') left = (layoutWidth - texture.width) * 0.5
      if (this.align === 'right') left = layoutWidth - texture.width
      const localX = left - t.anchorX * layoutWidth
      const localY = top + i * lineAdvance - t.anchorY * layoutHeight

      if (this.props.shadow) {
        const [shadowColor, shadowWidth, shadowOffset] = this.props.shadow
        for (const [offsetX, offsetY] of shadowOffsets(shadowWidth)) {
          this.drawLine(texture, t,
            localX + shadowOffset.width + offsetX,
            localY + shadowOffset.height + offsetY,
            shadowColor, renderOrigin)
        }
      }
      if (this.props.outline) {
        const [outlineColor, outlineWidth] = this.props.outline
        for (const [offsetX, offsetY] of outlineOffsets(outlineWidth)) {
          this.drawLine(texture, t, localX + offsetX, localY + offsetY,
            outlineColor, renderOrigin)
        }
      }
      this.drawLine(texture, t, localX, localY, this.node.color,
        renderOrigin)
    }
  }

  onDestroy(): void {
    this.releaseAssets()
  }

  private drawLine(
    texture: TextureAsset,
    transform: Node,
    localX: number,
    localY: number,
    color: Color,
    origin?: Point,
  ): void {
    const radians = transform.worldRotation * Math.PI / 180
    const scaledX = localX * transform.worldScaleX
    const scaledY = localY * transform.worldScaleY
    const originX = origin?.x ?? transform.worldX
    const originY = origin?.y ?? transform.worldY
    const x = originX
      + scaledX * Math.cos(radians) - scaledY * Math.sin(radians)
    const y = originY
      + scaledX * Math.sin(radians) + scaledY * Math.cos(radians)
    drawTextureRotated(
      texture.id,
      x,
      y,
      texture.width * transform.worldScaleX,
      texture.height * transform.worldScaleY,
      transform.worldRotation,
      0,
      0,
      false,
      false,
      color.r,
      color.g,
      color.b,
      this.node.opacity * (color.a ?? 255),
    )
  }

  private getRenderOrigin(): Point | undefined {
    if (this.isSharedNode()
      || this.node.hasExplicitPosition
      || !this.node.parent
    ) {
      return undefined
    }

    return this.node.parent.contentToWorld(
      this.node.parent.width * 0.5,
      this.node.parent.height * 0.5,
    )
  }

  private ensureAssets(): void {
    const resolvedText = this.localizationKey
      ? Localization.translate(this.localizationKey, this.localizationValues)
      : this.text
    if (!this.fontPath || !resolvedText) {
      this.releaseText()
      return
    }

    const fontKey = `${this.fontPath}\0${this.fontSize}`
    if (!this.font || this.loadedFontKey !== fontKey) {
      this.releaseAssets()
      this.font = AssetManager.acquireFont(this.fontPath, this.fontSize)
      this.fontId = this.font.id
      this.loadedFontKey = fontKey
    }

    const wrapWidth = this.isAutoWidth() ? 0 : this.node.width
    const signature = `${resolvedText}\0${wrapWidth}\0${this.fontSize}`
    if (this.loadedSignature === signature && this.lineTextures.length > 0) return
    this.releaseText()
    this.lines = wrapText(resolvedText, wrapWidth, (value) => {
      const texture = AssetManager.acquireText(this.font!, value || ' ')
      const width = texture.width
      texture.release()
      return width
    })
    this.lineTextures = this.lines.map(line =>
      AssetManager.acquireText(this.font!, line || ' ')
    )
    this.applyNaturalSize()
    this.loadedSignature = signature
    this.localizationRevision = Localization.revision
  }

  private applyNaturalSize(): void {
    const { width, height } = this.measureText()
    this.naturalWidth = width
    this.naturalHeight = height

    if (!this.isSharedNode() && width > 0 && this.isAutoWidth()) {
      this.node.width = width
      this.autoWidth = width
    }
    if (!this.isSharedNode() && height > 0 && this.isAutoHeight()) {
      this.node.height = height
      this.autoHeight = height
    }
  }

  private measureText(): Size {
    const width = this.lineTextures.reduce(
      (maxWidth, texture) => Math.max(maxWidth, texture.width), 0)
    const lineAdvance = this.fontSize * this.lineHeight
    const height = this.lineTextures.length === 0
      ? 0
      : this.lineTextures.length === 1
        ? this.lineTextures[0].height
        : (this.lineTextures.length - 1) * lineAdvance
          + this.lineTextures[this.lineTextures.length - 1].height

    return {
      width: width || this.naturalWidth,
      height: height || this.naturalHeight,
    }
  }

  private isAutoWidth(): boolean {
    return this.isSharedNode()
      || this.node.width === DEFAULT_NODE_WIDTH
      || (this.autoWidth > 0 && this.node.width === this.autoWidth)
  }

  private isAutoHeight(): boolean {
    return this.isSharedNode()
      || this.node.height === DEFAULT_NODE_HEIGHT
      || (this.autoHeight > 0 && this.node.height === this.autoHeight)
  }

  private isSharedNode(): boolean {
    return this.node.components[0] !== this
  }

  private releaseText(): void {
    for (const texture of this.lineTextures) texture.release()
    this.lineTextures = []
    this.lines = []
    this.loadedSignature = ''
    this.naturalWidth = 0
    this.naturalHeight = 0
  }

  private releaseAssets(): void {
    this.releaseText()
    this.font?.release()
    this.font = null
    this.fontId = -1
    this.loadedFontKey = ''
  }
}

function wrapText(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  if (width <= 0) return text.split('\n')
  const result: string[] = []

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      result.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      if (measure(word) > width) {
        if (line) {
          result.push(line)
          line = ''
        }
        let chunk = ''
        for (const character of Array.from(word)) {
          const candidate = chunk + character
          if (chunk && measure(candidate) > width) {
            result.push(chunk)
            chunk = character
          } else {
            chunk = candidate
          }
        }
        if (chunk) line = chunk
        continue
      }
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate) <= width || !line) {
        line = candidate
      } else {
        result.push(line)
        line = word
      }
    }
    if (line) result.push(line)
  }
  return result
}

function outlineOffsets(width: number): Array<[number, number]> {
  const radius = Math.max(1, Math.round(width))
  const offsets: Array<[number, number]> = []
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x === 0 && y === 0) continue
      if (x * x + y * y <= radius * radius) offsets.push([x, y])
    }
  }
  return offsets
}

function shadowOffsets(width: number): Array<[number, number]> {
  if (width <= 0) return [[0, 0]]
  return outlineOffsets(width)
}
