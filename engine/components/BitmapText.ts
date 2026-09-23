import { ComponentX } from '../core/ComponentX'
import { BitmapFont } from '../font/BitmapFont'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'

export type BitmapTextAlign = 'left' | 'center' | 'right'

export interface BitmapTextProps {
  font?: string | BitmapFont
  text?: string
  fontSize?: number
  align?: BitmapTextAlign
  letterSpacing?: number
  lineHeight?: number
}

export class BitmapText extends ComponentX<BitmapTextProps> {
  font: BitmapFont | null = null
  text = ''
  fontSize = 0
  align: BitmapTextAlign = 'left'
  letterSpacing = 0
  lineHeight = 0

  onAwake(): void {
    if (this.props.text !== undefined) this.text = this.props.text
    if (this.props.align !== undefined) this.align = this.props.align
    if (this.props.letterSpacing !== undefined) this.letterSpacing = this.props.letterSpacing
    if (this.props.lineHeight !== undefined) this.lineHeight = this.props.lineHeight
    if (this.props.fontSize !== undefined) this.fontSize = this.props.fontSize

    this.resolveFont(this.props.font)
  }

  resolveFont(fontInput?: string | BitmapFont): void {
    if (!fontInput) return
    if (fontInput instanceof BitmapFont) {
      this.font = fontInput
    } else {
      this.font = BitmapFont.get(fontInput)
    }
  }

  setFont(font: string | BitmapFont): this {
    this.resolveFont(font)
    return this
  }

  onRender(): void {
    if (!this.node.visible || !this.text) return
    if (!this.font && this.props.font) {
      this.resolveFont(this.props.font)
    }
    const font = this.font
    if (!font) return

    const fontScale = this.fontSize > 0 && font.data.size > 0 ? this.fontSize / font.data.size : 1
    const baseLineHeight = this.lineHeight > 0 ? this.lineHeight : font.data.lineHeight * fontScale

    const lines = this.text.split(/\r?\n/)
    const measuredLines: { line: string, width: number }[] = []
    let maxLineWidth = 0

    for (const line of lines) {
      let lineWidth = 0
      let prevCode = -1
      for (const char of line) {
        const code = char.codePointAt(0) ?? char.charCodeAt(0)
        const charData = font.getChar(code)
        if (!charData) continue
        const kerning = prevCode !== -1 ? font.getKerning(prevCode, code) : 0
        lineWidth += (charData.xadvance + kerning + this.letterSpacing) * fontScale
        prevCode = code
      }
      measuredLines.push({ line, width: lineWidth })
      if (lineWidth > maxLineWidth) maxLineWidth = lineWidth
    }

    const layoutWidth = this.node.width > 0 ? this.node.width : maxLineWidth
    const totalTextHeight = measuredLines.length * baseLineHeight
    const layoutHeight = this.node.height > 0 ? this.node.height : totalTextHeight

    const node = this.node
    const radians = (node.renderRotation * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const scaleX = node.renderScaleX
    const scaleY = node.renderScaleY
    const opacity = node.opacity * (node.color.a ?? 255)

    const anchorOriginX = -node.anchorX * layoutWidth
    const anchorOriginY = -node.anchorY * layoutHeight

    let currentY = anchorOriginY

    for (const { line, width: lineWidth } of measuredLines) {
      let currentX = anchorOriginX
      if (this.align === 'center') {
        currentX += (layoutWidth - lineWidth) * 0.5
      } else if (this.align === 'right') {
        currentX += layoutWidth - lineWidth
      }

      let prevCode = -1
      for (const char of line) {
        const code = char.codePointAt(0) ?? char.charCodeAt(0)
        const charData = font.getChar(code)
        if (!charData) continue

        const kerning = prevCode !== -1 ? font.getKerning(prevCode, code) : 0
        currentX += kerning * fontScale

        const charLocalX = currentX + charData.xoffset * fontScale
        const charLocalY = currentY + charData.yoffset * fontScale
        const charWidth = charData.width * fontScale
        const charHeight = charData.height * fontScale

        // Transform quad position into camera/world space
        const lx = charLocalX * scaleX
        const ly = charLocalY * scaleY
        const renderX = node.renderX + lx * cos - ly * sin
        const renderY = node.renderY + lx * sin + ly * cos
        const renderW = charWidth * scaleX
        const renderH = charHeight * scaleY

        globalCommandBuffer.pushRegion(
          font.texture.id,
          charData.x,
          charData.y,
          charData.width,
          charData.height,
          renderX,
          renderY,
          renderW,
          renderH,
          node.renderRotation,
          0,
          0,
          node.flipX,
          node.flipY,
          node.color.r,
          node.color.g,
          node.color.b,
          opacity,
          false,
        )

        currentX += (charData.xadvance + this.letterSpacing) * fontScale
        prevCode = code
      }

      currentY += baseLineHeight
    }
  }
}
