import { drawTextureRotated } from 'sdl3'
import {
  AssetManager,
  FontAsset,
  TextureAsset,
} from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, Node } from '../core/Node'
import { Label, TextAlignment } from './Label'

export interface RichTextProps {
  font?: string
  string?: string
  size?: number
  fontSize?: number
  lineHeight?: number
  maxWidth?: number
  align?: TextAlignment
  horizontalAlign?: TextAlignment | number
}

interface RichTextOutline {
  color: Color
  width: number
}

interface RichTextStyle {
  color?: Color
  size: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  outline?: RichTextOutline
}

interface RichTextToken {
  text?: string
  newline?: boolean
  style: RichTextStyle
}

interface RichTextPart {
  text: string
  style: RichTextStyle
}

interface RichTextSegment extends RichTextPart {
  texture: TextureAsset
  x: number
}

interface RichTextLine {
  segments: RichTextSegment[]
  width: number
  height: number
  y: number
}

export class RichText extends ComponentX<RichTextProps> {
  static defaultFont: string
  static defaultSize: Integer = 36
  text = ''
  fontPath = ''
  fontSize = RichText.defaultSize
  fontId = -1
  lineHeight = RichText.defaultSize * 1.2
  maxWidth = 0
  declare align: TextAlignment
  private fonts = new Map<number, FontAsset>()
  private lines: RichTextLine[] = []
  private loadedSignature = ''
  private autoWidth = 0
  private autoHeight = 0
  private naturalWidth = 0
  private naturalHeight = 0

  onAwake(): void {
    if (this.props.string !== undefined) {
      this.string = this.props.string
    }
    const fontSize = this.props.fontSize ?? this.props.size ?? RichText.defaultSize
    this.setFont(this.props.font || RichText.defaultFont || Label.defaultFont, fontSize)
    this.lineHeight = this.props.lineHeight ?? this.fontSize * 1.2
    this.maxWidth = this.props.maxWidth ?? 0
    this.align = normalizeAlign(this.props.horizontalAlign ?? this.props.align)
  }

  onStart(): void {
    this.ensureAssets()
  }

  get string(): string {
    return this.text
  }

  set string(text: string) {
    if (this.text === text) return
    this.text = text
    this.releaseText()
  }

  setFont(path: string, size: number = this.fontSize): this {
    if (this.fontPath === path && this.fontSize === size) return this
    this.releaseAssets()
    this.fontPath = path
    this.fontSize = size
    if (!this.props.lineHeight) this.lineHeight = size * 1.2
    return this
  }

  setFontSize(size: number): this {
    return this.setFont(this.fontPath, size)
  }

  setMaxWidth(width: number): this {
    if (this.maxWidth === width) return this
    this.maxWidth = width
    this.releaseText()
    return this
  }

  setLineHeight(height: number): this {
    if (this.lineHeight === height) return this
    this.lineHeight = height
    this.releaseText()
    return this
  }

  onRender(): void {
    this.ensureAssets()
    if (this.lines.length === 0) return
    const t = this.node
    if (!t) return

    const { width: naturalWidth, height: textHeight } = this.measureText()
    const layoutWidth = this.layoutWidth(naturalWidth)
    const layoutHeight = this.isSharedNode()
      ? textHeight
      : this.node.height > 0 ? this.node.height : textHeight
    const renderOrigin = this.getRenderOrigin()

    for (const line of this.lines) {
      let left = 0
      if (this.align === TextAlignment.center) left = (layoutWidth - line.width) * 0.5
      if (this.align === TextAlignment.right) left = layoutWidth - line.width
      for (const segment of line.segments) {
        const localX = left + segment.x - t.anchorX * layoutWidth
        const localY = line.y - t.anchorY * layoutHeight
        if (segment.style.outline) {
          for (const [offsetX, offsetY] of outlineOffsets(segment.style.outline.width)) {
            this.drawSegment(
              segment,
              t,
              localX + offsetX,
              localY + offsetY,
              segment.style.outline.color,
              renderOrigin,
            )
          }
        }
        this.drawSegment(
          segment,
          t,
          localX,
          localY,
          segment.style.color ?? this.node.color,
          renderOrigin,
        )
      }
    }
  }

  onDestroy(): void {
    this.releaseAssets()
  }

  private drawSegment(
    segment: RichTextSegment,
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
      segment.texture.id,
      x,
      y,
      segment.texture.width * transform.worldScaleX,
      segment.texture.height * transform.worldScaleY,
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
    if (!this.fontPath || !this.text) {
      this.releaseText()
      return
    }

    const wrapWidth = this.wrapWidth()
    const signature = [
      this.text,
      this.fontPath,
      this.fontSize,
      this.lineHeight,
      wrapWidth,
    ].join('\0')
    if (this.loadedSignature === signature && this.lines.length > 0) return

    this.releaseText()
    const tokens = parseRichText(this.text, {
      size: this.fontSize,
    })
    const layoutLines = this.layoutTokens(tokens, wrapWidth)
    this.lines = layoutLines.map(line => this.createLine(line))
    this.applyNaturalSize()
    this.loadedSignature = signature
  }

  private layoutTokens(tokens: RichTextToken[], wrapWidth: number): Array<{
    parts: RichTextPart[]
    width: number
    height: number
  }> {
    const lines: Array<{ parts: RichTextPart[], width: number, height: number }> = []
    let parts: RichTextPart[] = []
    let width = 0
    let height = this.fontSize

    const pushLine = () => {
      lines.push({ parts, width, height })
      parts = []
      width = 0
      height = this.fontSize
    }
    const appendPart = (text: string, style: RichTextStyle) => {
      if (!text) return
      const textWidth = this.measurePart(text, style)
      const last = parts[parts.length - 1]
      if (last && stylesEqual(last.style, style)) {
        last.text += text
      } else {
        parts.push({ text, style: cloneStyle(style) })
      }
      width += textWidth
      height = Math.max(height, style.size)
    }

    for (const token of tokens) {
      if (token.newline) {
        pushLine()
        continue
      }

      for (const unit of splitWrapUnits(token.text ?? '')) {
        if (!unit) continue
        const isWhitespace = /^\s+$/.test(unit)
        if (isWhitespace && width === 0) continue
        const unitWidth = this.measurePart(unit, token.style)
        if (wrapWidth > 0 && width > 0 && width + unitWidth > wrapWidth) {
          pushLine()
          if (isWhitespace) continue
        }
        if (wrapWidth > 0 && unitWidth > wrapWidth) {
          for (const character of Array.from(unit)) {
            const characterWidth = this.measurePart(character, token.style)
            if (width > 0 && width + characterWidth > wrapWidth) pushLine()
            appendPart(character, token.style)
          }
        } else {
          appendPart(unit, token.style)
        }
      }
    }

    if (parts.length > 0 || lines.length === 0) pushLine()
    return lines
  }

  private createLine(
    line: { parts: RichTextPart[], width: number, height: number },
  ): RichTextLine {
    let x = 0
    const segments = line.parts.map((part) => {
      const font = this.ensureFont(part.style.size)
      const texture = AssetManager.acquireText(font, part.text || ' ')
      const segment: RichTextSegment = {
        text: part.text,
        style: cloneStyle(part.style),
        texture,
        x,
      }
      x += texture.width
      return segment
    })

    return {
      segments,
      width: line.width,
      height: line.height,
      y: 0,
    }
  }

  private measurePart(text: string, style: RichTextStyle): number {
    const font = this.ensureFont(style.size)
    const texture = AssetManager.acquireText(font, text || ' ')
    const width = texture.width
    texture.release()
    return width
  }

  private ensureFont(size: number): FontAsset {
    let font = this.fonts.get(size)
    if (!font) {
      font = AssetManager.acquireFont(this.fontPath, size)
      this.fonts.set(size, font)
      if (size === this.fontSize) this.fontId = font.id
    }
    return font
  }

  private applyNaturalSize(): void {
    let y = 0
    for (const line of this.lines) {
      line.y = y
      y += this.lineHeight
    }

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
    const width = this.lines.reduce(
      (maxWidth, line) => Math.max(maxWidth, line.width), 0)
    const height = this.lines.length === 0
      ? 0
      : (this.lines.length - 1) * this.lineHeight
        + this.lines[this.lines.length - 1].height

    return {
      width: width || this.naturalWidth,
      height: height || this.naturalHeight,
    }
  }

  private wrapWidth(): number {
    if (this.maxWidth > 0) return this.maxWidth
    return this.isAutoWidth() ? 0 : this.node.width
  }

  private layoutWidth(naturalWidth: number): number {
    if (this.isSharedNode()) return naturalWidth
    if (this.maxWidth > 0) return this.maxWidth
    return this.node.width > 0 ? this.node.width : naturalWidth
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
    for (const line of this.lines) {
      for (const segment of line.segments) segment.texture.release()
    }
    this.lines = []
    this.loadedSignature = ''
    this.naturalWidth = 0
    this.naturalHeight = 0
  }

  private releaseAssets(): void {
    this.releaseText()
    for (const font of this.fonts.values()) font.release()
    this.fonts.clear()
    this.fontId = -1
  }
}

function parseRichText(text: string, baseStyle: RichTextStyle): RichTextToken[] {
  const tokens: RichTextToken[] = []
  const stack: Array<{ name: string, style: RichTextStyle }> = [
    { name: '', style: cloneStyle(baseStyle) },
  ]
  let index = 0

  const currentStyle = () => stack[stack.length - 1].style
  const pushText = (value: string) => {
    if (!value) return
    const normalized = decodeEntities(value)
    const pieces = normalized.split('\n')
    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i]) tokens.push({ text: pieces[i], style: cloneStyle(currentStyle()) })
      if (i < pieces.length - 1) tokens.push({ newline: true, style: cloneStyle(currentStyle()) })
    }
  }

  while (index < text.length) {
    const tagStart = text.indexOf('<', index)
    if (tagStart < 0) {
      pushText(text.slice(index))
      break
    }
    pushText(text.slice(index, tagStart))
    const tagEnd = text.indexOf('>', tagStart + 1)
    if (tagEnd < 0) {
      pushText(text.slice(tagStart))
      break
    }

    const rawTag = text.slice(tagStart + 1, tagEnd).trim()
    if (!applyTag(rawTag, stack, tokens)) {
      pushText(text.slice(tagStart, tagEnd + 1))
    }
    index = tagEnd + 1
  }

  return tokens
}

function applyTag(
  rawTag: string,
  stack: Array<{ name: string, style: RichTextStyle }>,
  tokens: RichTextToken[],
): boolean {
  const selfClosing = rawTag.endsWith('/')
  const tag = selfClosing ? rawTag.slice(0, -1).trim() : rawTag
  const closing = tag.startsWith('/')
  const name = tagName(closing ? tag.slice(1).trim() : tag)

  if (name === 'br') {
    tokens.push({ newline: true, style: cloneStyle(stack[stack.length - 1].style) })
    return true
  }

  if (closing) {
    const closeIndex = stack.map(item => item.name).lastIndexOf(name)
    if (closeIndex <= 0) return isSupportedTag(name)
    stack.splice(closeIndex)
    return true
  }

  const nextStyle = styleForTag(name, tag, stack[stack.length - 1].style)
  if (!nextStyle) return name === 'img'
  if (!selfClosing) stack.push({ name, style: nextStyle })
  return true
}

function styleForTag(
  name: string,
  tag: string,
  current: RichTextStyle,
): RichTextStyle | null {
  const next = cloneStyle(current)

  if (name === 'color') {
    const colorValue = attributeValue(tag, 'color') ?? directTagValue(tag)
    const color = colorValue ? parseColor(colorValue) : null
    if (!color) return null
    next.color = color
    return next
  }

  if (name === 'size') {
    const sizeValue = attributeValue(tag, 'size') ?? directTagValue(tag)
    const size = sizeValue ? Number(sizeValue) : Number.NaN
    if (!Number.isFinite(size) || size <= 0) return null
    next.size = size
    return next
  }

  if (name === 'outline') {
    const color = parseColor(attributeValue(tag, 'color') ?? '#000000')
    const width = Number(attributeValue(tag, 'width') ?? 1)
    if (!color || !Number.isFinite(width) || width <= 0) return null
    next.outline = { color, width }
    return next
  }

  if (name === 'b') {
    next.bold = true
    return next
  }

  if (name === 'i') {
    next.italic = true
    return next
  }

  if (name === 'u') {
    next.underline = true
    return next
  }

  if (name === 'on') {
    return next
  }

  return null
}

function tagName(tag: string): string {
  return tag.split(/[\s=]/, 1)[0].toLowerCase()
}

function isSupportedTag(name: string): boolean {
  return ['color', 'size', 'outline', 'b', 'i', 'u', 'on', 'br', 'img'].includes(name)
}

function directTagValue(tag: string): string | null {
  const match = /^[^=]+=(.+)$/.exec(tag)
  return match ? stripQuotes(match[1].trim()) : null
}

function attributeValue(tag: string, attribute: string): string | null {
  const pattern = new RegExp(`(?:^|\\s)${attribute}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s]+)`, 'i')
  const match = pattern.exec(tag)
  return match ? stripQuotes(match[1]) : null
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1)
  }
  return value
}

function parseColor(value: string): Color | null {
  const text = value.trim()
  if (text.startsWith('#')) return parseHexColor(text)

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (rgb) {
    const parts = rgb[1].split(',').map(part => Number(part.trim()))
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return {
        r: clampColor(parts[0]),
        g: clampColor(parts[1]),
        b: clampColor(parts[2]),
        a: parts[3] === undefined ? 255 : clampColor(parts[3]),
      }
    }
  }

  return namedColors[text.toLowerCase()] ?? null
}

function parseHexColor(value: string): Color | null {
  const hex = value.slice(1)
  if (hex.length === 3 || hex.length === 4) {
    const values = Array.from(hex).map(character =>
      Number.parseInt(character + character, 16)
    )
    if (values.some(Number.isNaN)) return null
    return {
      r: values[0],
      g: values[1],
      b: values[2],
      a: values[3] ?? 255,
    }
  }

  if (hex.length === 6 || hex.length === 8) {
    if (Number.isNaN(Number.parseInt(hex, 16))) return null
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
    }
  }

  return null
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

const namedColors: Readonly<Record<string, Color>> = {
  black: { r: 0, g: 0, b: 0, a: 255 },
  blue: { r: 0, g: 0, b: 255, a: 255 },
  green: { r: 0, g: 128, b: 0, a: 255 },
  red: { r: 255, g: 0, b: 0, a: 255 },
  white: { r: 255, g: 255, b: 255, a: 255 },
  yellow: { r: 255, g: 255, b: 0, a: 255 },
}

function splitWrapUnits(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean)
}

function normalizeAlign(value: RichTextProps['horizontalAlign']): TextAlignment {
  if (value === 1) return TextAlignment.center
  if (value === 2) return TextAlignment.right
  if (value === TextAlignment.left
    || value === TextAlignment.center
    || value === TextAlignment.right) return value
  return TextAlignment.center
}

function cloneStyle(style: RichTextStyle): RichTextStyle {
  return {
    color: style.color ? { ...style.color } : undefined,
    size: style.size,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    outline: style.outline
      ? { color: { ...style.outline.color }, width: style.outline.width }
      : undefined,
  }
}

function stylesEqual(a: RichTextStyle, b: RichTextStyle): boolean {
  return a.size === b.size
    && colorEqual(a.color, b.color)
    && a.bold === b.bold
    && a.italic === b.italic
    && a.underline === b.underline
    && outlineEqual(a.outline, b.outline)
}

function colorEqual(a?: Color, b?: Color): boolean {
  if (!a || !b) return a === b
  return a.r === b.r && a.g === b.g && a.b === b.b && (a.a ?? 255) === (b.a ?? 255)
}

function outlineEqual(a?: RichTextOutline, b?: RichTextOutline): boolean {
  if (!a || !b) return a === b
  return a.width === b.width && colorEqual(a.color, b.color)
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
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
