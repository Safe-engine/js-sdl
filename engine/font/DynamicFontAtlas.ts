import type { Node } from '../core/Node'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import * as sdl3 from 'sdl3'

export interface DynamicGlyph {
  char: string
  code: number
  x: number
  y: number
  width: number
  height: number
  ascent: number
  descent: number
  xadvance: number
  textureId: number
}

export interface DynamicFontRenderOptions {
  family?: string
  size?: number
  lineHeight?: number
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  letterSpacing?: number
  shadow?: [Color, number, Size]
  outline?: [Color, number]
}

function createAtlasCanvas(width: number, height: number): { canvas: any, context: any } {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const canvas = document.createElement('canvas')
      if (canvas) {
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext?.('2d')
        if (context) return { canvas, context }
      }
    } catch {
      // Fallback
    }
  }

  // Fallback mock context for headless / node / bun test environments
  const mockContext = {
    font: '',
    fillStyle: '',
    textBaseline: '',
    measureText: (text: string) => {
      const charWidth = 10
      return {
        width: text.length * charWidth,
        actualBoundingBoxAscent: 16,
        actualBoundingBoxDescent: 4,
      }
    },
    fillText: () => {},
    clearRect: () => {},
  }
  const mockCanvas = {
    width,
    height,
    getContext: () => mockContext,
  }
  return { canvas: mockCanvas, context: mockContext }
}

export class DynamicFontAtlas {
  readonly width: number
  readonly height: number
  private readonly padding: number

  private canvas: any = null
  private context: any = null
  private textureId = -1

  private cursorX = 1
  private cursorY = 1
  private rowHeight = 0

  private readonly glyphs = new Map<string, DynamicGlyph>()

  constructor(width = 1024, height = 1024, padding = 1) {
    this.width = width
    this.height = height
    this.padding = padding
  }

  getTextureId(): number {
    this.ensureInitialized()
    return this.textureId
  }

  private ensureInitialized(): void {
    if (this.textureId >= 0 && this.context) return
    const { canvas, context } = createAtlasCanvas(this.width, this.height)
    this.canvas = canvas
    this.context = context
    if (this.textureId < 0) {
      if (typeof (sdl3 as any).createDynamicTexture === 'function') {
        this.textureId = (sdl3 as any).createDynamicTexture(this.width, this.height, this.canvas)
      } else {
        this.textureId = 9999
      }
    }
  }

  private allocate(w: number, h: number): { x: number, y: number } | null {
    if (this.cursorX + w + this.padding > this.width) {
      this.cursorX = this.padding
      this.cursorY += this.rowHeight + this.padding
      this.rowHeight = 0
    }
    if (this.cursorY + h + this.padding > this.height) {
      return null
    }
    const pos = { x: this.cursorX, y: this.cursorY }
    this.cursorX += w + this.padding
    this.rowHeight = Math.max(this.rowHeight, h)
    return pos
  }

  reset(): void {
    this.glyphs.clear()
    this.cursorX = this.padding
    this.cursorY = this.padding
    this.rowHeight = 0
    if (this.context) {
      this.context.clearRect(0, 0, this.width, this.height)
    }
    if (this.textureId >= 0 && typeof (sdl3 as any).updateDynamicTexture === 'function') {
      (sdl3 as any).updateDynamicTexture(this.textureId, this.canvas, this.width, this.height)
    }
  }

  getGlyph(family: string, size: number, char: string): DynamicGlyph {
    this.ensureInitialized()
    const key = `${family}:${size}:${char}`
    const existing = this.glyphs.get(key)
    if (existing) return existing

    const code = char.codePointAt(0) ?? char.charCodeAt(0)
    const ctx = this.context
    ctx.font = `${size}px "${family}", sans-serif`

    // Space character optimization (no pixels needed in atlas)
    if (char === ' ' || char === '\t') {
      const spaceMetrics = ctx.measureText(char)
      const spaceWidth = Math.ceil(spaceMetrics.width || size * 0.3)
      const glyph: DynamicGlyph = {
        char,
        code,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        ascent: size * 0.8,
        descent: size * 0.2,
        xadvance: spaceWidth,
        textureId: this.textureId,
      }
      this.glyphs.set(key, glyph)
      return glyph
    }

    const metrics = ctx.measureText(char)
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent ?? size * 0.8)
    const descent = Math.ceil(metrics.actualBoundingBoxDescent ?? size * 0.2)
    const charWidth = Math.max(1, Math.ceil(metrics.width))
    const charHeight = Math.max(1, ascent + descent)

    let pos = this.allocate(charWidth, charHeight)
    if (!pos) {
      // Atlas is full; reset and re-allocate
      this.reset()
      pos = this.allocate(charWidth, charHeight) ?? { x: 0, y: 0 }
    }

    // Rasterize in solid white (#ffffff) so vertex attribute a_color can tint it freely
    ctx.font = `${size}px "${family}", sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(char, pos.x, pos.y + ascent)

    if (typeof (sdl3 as any).updateDynamicTexture === 'function') {
      (sdl3 as any).updateDynamicTexture(this.textureId, this.canvas, this.width, this.height)
    }

    const glyph: DynamicGlyph = {
      char,
      code,
      x: pos.x,
      y: pos.y,
      width: charWidth,
      height: charHeight,
      ascent,
      descent,
      xadvance: charWidth,
      textureId: this.textureId,
    }
    this.glyphs.set(key, glyph)
    return glyph
  }

  measureText(
    family: string,
    size: number,
    text: string,
    lineHeight = 1.2,
    letterSpacing = 0,
  ): { width: number, height: number } {
    const lines = text.split(/\r?\n/)
    let maxWidth = 0
    const lineAdvance = size * lineHeight

    for (const line of lines) {
      let lineWidth = 0
      for (const char of line) {
        const glyph = this.getGlyph(family, size, char)
        lineWidth += glyph.xadvance + letterSpacing
      }
      if (lineWidth > maxWidth) maxWidth = lineWidth
    }

    return {
      width: Math.ceil(maxWidth),
      height: Math.ceil(lines.length * lineAdvance),
    }
  }

  renderText(
    node: Node,
    text: string,
    options: DynamicFontRenderOptions = {},
  ): void {
    if (!node.visible || !text) return
    const family = options.family ?? 'sans-serif'
    const size = options.size ?? 32
    const lineHeightRatio = options.lineHeight ?? 1.2
    const lineAdvance = size * lineHeightRatio
    const letterSpacing = options.letterSpacing ?? 0
    const align = options.align ?? 'center'
    const verticalAlign = options.verticalAlign ?? 'middle'

    const lines = text.split(/\r?\n/)
    const measuredLines: { line: string, width: number }[] = []
    let maxLineWidth = 0

    for (const line of lines) {
      let lineWidth = 0
      for (const char of line) {
        const glyph = this.getGlyph(family, size, char)
        lineWidth += glyph.xadvance + letterSpacing
      }
      measuredLines.push({ line, width: lineWidth })
      if (lineWidth > maxLineWidth) maxLineWidth = lineWidth
    }

    const naturalWidth = maxLineWidth
    const totalTextHeight = lines.length * lineAdvance
    const layoutWidth = node.width > 0 ? node.width : naturalWidth
    const layoutHeight = node.height > 0 ? node.height : totalTextHeight

    let top = 0
    if (verticalAlign === 'middle') top = (layoutHeight - totalTextHeight) * 0.5
    if (verticalAlign === 'bottom') top = layoutHeight - totalTextHeight

    const radians = (node.renderRotation * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const scaleX = node.renderScaleX
    const scaleY = node.renderScaleY
    const baseColor = node.color
    const opacity = node.opacity * (baseColor.a ?? 255)

    const drawPass = (
      offsetX: number,
      offsetY: number,
      color: Color,
      passOpacity: number,
    ) => {
      let currentY = top - node.anchorY * layoutHeight + offsetY

      for (const { line, width: lineWidth } of measuredLines) {
        let currentX = -node.anchorX * layoutWidth + offsetX
        if (align === 'center') {
          currentX += (layoutWidth - lineWidth) * 0.5
        } else if (align === 'right') {
          currentX += layoutWidth - lineWidth
        }

        for (const char of line) {
          const glyph = this.getGlyph(family, size, char)
          if (glyph.width > 0 && glyph.height > 0) {
            const lx = currentX * scaleX
            const ly = currentY * scaleY
            const renderX = node.renderX + lx * cos - ly * sin
            const renderY = node.renderY + lx * sin + ly * cos
            const renderW = glyph.width * scaleX
            const renderH = glyph.height * scaleY

            globalCommandBuffer.pushRegion(
              glyph.textureId,
              glyph.x,
              glyph.y,
              glyph.width,
              glyph.height,
              renderX,
              renderY,
              renderW,
              renderH,
              node.renderRotation,
              0,
              0,
              node.flipX,
              node.flipY,
              color.r,
              color.g,
              color.b,
              passOpacity,
              false,
            )
          }
          currentX += glyph.xadvance + letterSpacing
        }

        currentY += lineAdvance
      }
    }

    // Shadow pass
    if (options.shadow) {
      const [shadowColor, , shadowOffset] = options.shadow
      drawPass(
        shadowOffset.width,
        shadowOffset.height,
        shadowColor,
        node.opacity * (shadowColor.a ?? 255),
      )
    }

    // Main text pass
    drawPass(0, 0, baseColor, opacity)
  }
}

export const dynamicFontAtlas = new DynamicFontAtlas()
