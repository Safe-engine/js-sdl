import {
  drawRect,
  drawTextureRotated,
  popClipRect,
  pushClipRect,
  startTextInput,
  stopTextInput,
} from 'sdl3'
import {
  AssetManager,
  FontAsset,
  TextureAsset,
} from '../AssetManager'
import type { InputEvent } from '../Input'
import { Label } from './Label'
import { containsPoint, worldRect } from './UI'
import { ComponentX } from '../core/ComponentX'

export interface TextInputProps {
  font?: string
  value?: string
  placeholder?: string
  size?: number
  maxLength?: number
  submitOnEnter?: boolean
  blurOnSubmit?: boolean
  onChange?: (value: string, target: TextInput) => void
  onFocus?: (target: TextInput) => void
  onBlur?: (target: TextInput) => void
  onSubmit?: (value: string, target: TextInput) => void
}

export class TextInput extends ComponentX<TextInputProps> {
  static focused: TextInput | null = null

  value = ''
  placeholder = ''
  fontPath = ''
  fontSize = Label.defaultSize
  maxLength = Number.POSITIVE_INFINITY
  submitOnEnter = true
  blurOnSubmit = false
  padding: Insets = { top: 10, right: 14, bottom: 10, left: 14 }
  backgroundColor: Color = { r: 15, g: 23, b: 42, a: 255 }
  focusedBackgroundColor: Color = { r: 30, g: 41, b: 59, a: 255 }
  borderColor: Color = { r: 71, g: 85, b: 105, a: 255 }
  focusedBorderColor: Color = { r: 96, g: 165, b: 250, a: 255 }
  textColor: Color = { r: 241, g: 245, b: 249, a: 255 }
  placeholderColor: Color = { r: 148, g: 163, b: 184, a: 255 }
  caretColor: Color = { r: 241, g: 245, b: 249, a: 255 }
  borderWidth = 2
  inputEnabled = true
  consumeInput = true

  private font: FontAsset | null = null
  private textTexture: TextureAsset | null = null
  private fontKey = ''
  private textKey = ''
  private clipActive = false
  private caretElapsed = 0
  private caretVisible = true

  onAwake(): void {
    this.value = this.props.value ?? ''
    this.placeholder = this.props.placeholder ?? ''
    this.fontPath = this.props.font || Label.defaultFont
    this.fontSize = this.props.size ?? Label.defaultSize
    this.maxLength = this.props.maxLength ?? Number.POSITIVE_INFINITY
    this.submitOnEnter = this.props.submitOnEnter ?? true
    this.blurOnSubmit = this.props.blurOnSubmit ?? false
  }

  onUpdate(dt: number): void {
    super.onUpdate(dt)
    if (!this.isFocused()) return
    this.caretElapsed += dt
    if (this.caretElapsed >= 0.5) {
      this.caretElapsed = 0
      this.caretVisible = !this.caretVisible
    }
  }

  onRender(): void {
    this.ensureAssets()
    const rect = worldRect(this.node)
    const isFocused = this.isFocused()
    const background = isFocused
      ? this.focusedBackgroundColor
      : this.backgroundColor
    const border = isFocused
      ? this.focusedBorderColor
      : this.borderColor
    drawRect(rect.x, rect.y, rect.width, rect.height,
      border.r, border.g, border.b, border.a ?? 255)

    const innerX = rect.x + this.borderWidth
    const innerY = rect.y + this.borderWidth
    const innerWidth = Math.max(0, rect.width - this.borderWidth * 2)
    const innerHeight = Math.max(0, rect.height - this.borderWidth * 2)
    drawRect(innerX, innerY, innerWidth, innerHeight,
      background.r, background.g, background.b, background.a ?? 255)

    const contentX = innerX + this.padding.left
    const contentY = innerY + this.padding.top
    const contentWidth = Math.max(0,
      innerWidth - this.padding.left - this.padding.right)
    const contentHeight = Math.max(0,
      innerHeight - this.padding.top - this.padding.bottom)
    if (contentWidth <= 0 || contentHeight <= 0) return

    pushClipRect(contentX, contentY, contentWidth, contentHeight)
    this.clipActive = true

    const texture = this.textTexture
    if (texture) {
      const offsetX = Math.max(0, texture.width - contentWidth)
      const color = this.value
        ? this.textColor
        : this.placeholderColor
      this.drawTexture(texture, contentX - offsetX,
        contentY + Math.max(0, (contentHeight - texture.height) * 0.5), color)

      if (isFocused && this.caretVisible) {
        const caretHeight = Math.min(contentHeight, Math.max(texture.height, this.fontSize))
        const caretX = Math.min(contentX + contentWidth - 1,
          contentX + texture.width - offsetX + 1)
        const caretY = contentY + Math.max(0, (contentHeight - caretHeight) * 0.5)
        drawRect(caretX, caretY, 1, caretHeight,
          this.caretColor.r, this.caretColor.g,
          this.caretColor.b, this.caretColor.a ?? 255)
      }
    } else if (isFocused && this.caretVisible) {
      const caretHeight = Math.min(contentHeight, this.fontSize)
      const caretY = contentY + Math.max(0, (contentHeight - caretHeight) * 0.5)
      drawRect(contentX, caretY, 1, caretHeight,
        this.caretColor.r, this.caretColor.g,
        this.caretColor.b, this.caretColor.a ?? 255)
    }
  }

  onRenderEnd(): void {
    if (this.clipActive) {
      popClipRect()
      this.clipActive = false
    }
  }

  onDestroy(): void {
    if (TextInput.focused === this) this.blur()
    this.releaseAssets()
  }

  hitTest(x: number, y: number): boolean {
    return containsPoint(this.node, x, y)
  }

  onPointerStart(event: InputEvent): void {
    this.focus()
    if (this.consumeInput) event.stopPropagation()
  }

  setText(value: string): this {
    const nextValue = this.applyMaxLength(value)
    if (nextValue === this.value) return this
    this.value = nextValue
    this.resetCaretBlink()
    this.releaseText()
    this.props.onChange?.(this.value, this)
    return this
  }

  clear(): this {
    return this.setText('')
  }

  focus(): this {
    if (TextInput.focused === this) return this
    TextInput.focused?.blur()
    TextInput.focused = this
    this.resetCaretBlink()
    startTextInput()
    this.props.onFocus?.(this)
    return this
  }

  blur(): this {
    if (TextInput.focused !== this) return this
    TextInput.focused = null
    stopTextInput()
    this.props.onBlur?.(this)
    return this
  }

  isFocused(): boolean {
    return TextInput.focused === this
  }

  static handleGlobalPointerStart(x: number, y: number): void {
    const active = TextInput.focused
    if (active && !containsPoint(active.node, x, y)) active.blur()
  }

  static handleTextInput(text: string): void {
    TextInput.focused?.insertText(text)
  }

  static handleKeyDown(key: string): void {
    const active = TextInput.focused
    if (!active) return
    if (key === 'Backspace') {
      active.deleteBackward()
      return
    }
    if (key === 'Enter' || key === 'Return') {
      if (active.submitOnEnter) {
        active.props.onSubmit?.(active.value, active)
        if (active.blurOnSubmit) active.blur()
      }
      return
    }
    if (key === 'Escape') {
      active.blur()
    }
  }

  private insertText(value: string): void {
    if (!value) return
    const nextValue = this.applyMaxLength(this.value + value)
    if (nextValue === this.value) return
    this.value = nextValue
    this.resetCaretBlink()
    this.releaseText()
    this.props.onChange?.(this.value, this)
  }

  private deleteBackward(): void {
    if (!this.value) return
    this.value = Array.from(this.value).slice(0, -1).join('')
    this.resetCaretBlink()
    this.releaseText()
    this.props.onChange?.(this.value, this)
  }

  private applyMaxLength(value: string): string {
    if (!Number.isFinite(this.maxLength)) return value
    return Array.from(value).slice(0, this.maxLength).join('')
  }

  private resetCaretBlink(): void {
    this.caretElapsed = 0
    this.caretVisible = true
  }

  private ensureAssets(): void {
    if (!this.fontPath) return
    const nextFontKey = `${this.fontPath}\0${this.fontSize}`
    if (!this.font || this.fontKey !== nextFontKey) {
      this.font?.release()
      this.font = AssetManager.acquireFont(this.fontPath, this.fontSize)
      this.fontKey = nextFontKey
      this.releaseText()
    }

    const display = this.value || this.placeholder
    if (!display) {
      this.releaseText()
      return
    }

    const nextTextKey = `${this.value ? 'value' : 'placeholder'}\0${display}`
    if (this.textTexture && this.textKey === nextTextKey) return
    this.releaseText()
    this.textTexture = AssetManager.acquireText(this.font!, display)
    this.textKey = nextTextKey
  }

  private drawTexture(
    texture: TextureAsset,
    x: number,
    y: number,
    color: Color,
  ): void {
    const transform = this.node
    const localX = (x - transform.worldX) / transform.worldScaleX
    const localY = (y - transform.worldY) / transform.worldScaleY
    drawTextureRotated(
      texture.id,
      transform.worldX + localX * transform.worldScaleX,
      transform.worldY + localY * transform.worldScaleY,
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

  private releaseText(): void {
    this.textTexture?.release()
    this.textTexture = null
    this.textKey = ''
  }

  private releaseAssets(): void {
    this.releaseText()
    this.font?.release()
    this.font = null
    this.fontKey = ''
  }
}
