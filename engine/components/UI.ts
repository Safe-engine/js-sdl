import * as sdl from 'sdl3'
import { AssetManager, TextureAsset } from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import type { Node } from '../core/Node'
import { white, zeroInsets } from '../helper/constants'
import type { InputEvent } from '../Input'

export type LayoutDirection = 'none' | 'horizontal' | 'vertical'
export type LayoutAlignment = 'start' | 'center' | 'end' | 'stretch'

export class UIElement<Props = unknown> extends ComponentX<Props> {
  private _width = 100
  private _height = 100
  private _minWidth = 0
  private _minHeight = 0
  private _maxWidth = Number.POSITIVE_INFINITY
  private _maxHeight = Number.POSITIVE_INFINITY
  private _flex = 0
  private _margin: Insets = zeroInsets()
  private _anchorMinX: number | null = null
  private _anchorMinY: number | null = null
  private _anchorMaxX: number | null = null
  private _anchorMaxY: number | null = null
  private _offsetLeft = 0
  private _offsetTop = 0
  private _offsetRight = 0
  private _offsetBottom = 0
  private _layoutDirty = true
  private _layoutVersion = 0
  private _lastParentLayoutVersion = -1

  onUpdate(_dt: number): void {
    if (!this.needsLayout()) return
    this.applyAnchors()
    this.clampSize()
    this.clearLayoutDirty()
  }

  get width(): number {
    return this._width
  }

  set width(value: number) {
    if (this._width === value) return
    this._width = value
    this.markLayoutDirty()
  }

  get height(): number {
    return this._height
  }

  set height(value: number) {
    if (this._height === value) return
    this._height = value
    this.markLayoutDirty()
  }

  get minWidth(): number {
    return this._minWidth
  }

  set minWidth(value: number) {
    if (this._minWidth === value) return
    this._minWidth = value
    this.markLayoutDirty()
  }

  get minHeight(): number {
    return this._minHeight
  }

  set minHeight(value: number) {
    if (this._minHeight === value) return
    this._minHeight = value
    this.markLayoutDirty()
  }

  get maxWidth(): number {
    return this._maxWidth
  }

  set maxWidth(value: number) {
    if (this._maxWidth === value) return
    this._maxWidth = value
    this.markLayoutDirty()
  }

  get maxHeight(): number {
    return this._maxHeight
  }

  set maxHeight(value: number) {
    if (this._maxHeight === value) return
    this._maxHeight = value
    this.markLayoutDirty()
  }

  get flex(): number {
    return this._flex
  }

  set flex(value: number) {
    if (this._flex === value) return
    this._flex = value
    this.markLayoutDirty()
  }

  get margin(): Insets {
    return this._margin
  }

  set margin(value: Insets) {
    if (this._margin === value) return
    this._margin = value
    this.markLayoutDirty()
  }

  get anchorMinX(): number | null {
    return this._anchorMinX
  }

  set anchorMinX(value: number | null) {
    if (this._anchorMinX === value) return
    this._anchorMinX = value
    this.markLayoutDirty()
  }

  get anchorMinY(): number | null {
    return this._anchorMinY
  }

  set anchorMinY(value: number | null) {
    if (this._anchorMinY === value) return
    this._anchorMinY = value
    this.markLayoutDirty()
  }

  get anchorMaxX(): number | null {
    return this._anchorMaxX
  }

  set anchorMaxX(value: number | null) {
    if (this._anchorMaxX === value) return
    this._anchorMaxX = value
    this.markLayoutDirty()
  }

  get anchorMaxY(): number | null {
    return this._anchorMaxY
  }

  set anchorMaxY(value: number | null) {
    if (this._anchorMaxY === value) return
    this._anchorMaxY = value
    this.markLayoutDirty()
  }

  get offsetLeft(): number {
    return this._offsetLeft
  }

  set offsetLeft(value: number) {
    if (this._offsetLeft === value) return
    this._offsetLeft = value
    this.markLayoutDirty()
  }

  get offsetTop(): number {
    return this._offsetTop
  }

  set offsetTop(value: number) {
    if (this._offsetTop === value) return
    this._offsetTop = value
    this.markLayoutDirty()
  }

  get offsetRight(): number {
    return this._offsetRight
  }

  set offsetRight(value: number) {
    if (this._offsetRight === value) return
    this._offsetRight = value
    this.markLayoutDirty()
  }

  get offsetBottom(): number {
    return this._offsetBottom
  }

  set offsetBottom(value: number) {
    if (this._offsetBottom === value) return
    this._offsetBottom = value
    this.markLayoutDirty()
  }

  get layoutDirty(): boolean {
    return this._layoutDirty
  }

  get layoutVersion(): number {
    return this._layoutVersion
  }

  setSize(width: number, height: number): this {
    this.width = width
    this.height = height
    return this
  }

  setAnchors(
    minX: number,
    minY: number,
    maxX: number = minX,
    maxY: number = minY,
  ): this {
    this.anchorMinX = minX
    this.anchorMinY = minY
    this.anchorMaxX = maxX
    this.anchorMaxY = maxY
    return this
  }

  protected markLayoutDirty(): void {
    this._layoutDirty = true
  }

  protected needsLayout(): boolean {
    return this._layoutDirty
      || this.parentLayoutVersion !== this._lastParentLayoutVersion
  }

  protected applyAnchors(): void {
    if (this.anchorMinX === null || this.anchorMinY === null || !this.node) return
    const parent = findUIElement(this.node.parent)
    if (!parent) return

    const maxX = this.anchorMaxX ?? this.anchorMinX
    const maxY = this.anchorMaxY ?? this.anchorMinY
    const parentTransform = parent.node
    const originX = -parentTransform.anchorX * parent.width
    const originY = -parentTransform.anchorY * parent.height
    const left = originX + parent.width * this.anchorMinX + this.offsetLeft
    const top = originY + parent.height * this.anchorMinY + this.offsetTop
    const right = originX + parent.width * maxX - this.offsetRight
    const bottom = originY + parent.height * maxY - this.offsetBottom
    const transform = this.node

    if (maxX !== this.anchorMinX) this.width = right - left
    if (maxY !== this.anchorMinY) this.height = bottom - top
    transform.x = left + this.width * transform.anchorX
    transform.y = top + this.height * transform.anchorY
  }

  protected clampSize(): void {
    this.width = Math.max(this.minWidth, Math.min(this.maxWidth, this.width))
    this.height = Math.max(this.minHeight, Math.min(this.maxHeight, this.height))
  }

  protected clearLayoutDirty(): void {
    const parentLayoutVersion = this.parentLayoutVersion
    if (this._layoutDirty || this._lastParentLayoutVersion !== parentLayoutVersion) {
      this._layoutVersion += 1
    }
    this._layoutDirty = false
    this._lastParentLayoutVersion = parentLayoutVersion
  }

  private get parentLayoutVersion(): number {
    return findUIElement(this.node?.parent ?? null)?.layoutVersion ?? -1
  }

  protected worldRect(): { x: number, y: number, width: number, height: number } {
    const t = this.node
    const width = this.width * Math.abs(t.worldScaleX)
    const height = this.height * Math.abs(t.worldScaleY)
    return {
      x: t.worldX - t.anchorX * width,
      y: t.worldY - t.anchorY * height,
      width,
      height,
    }
  }

  protected containsPoint(x: number, y: number): boolean {
    const rect = this.worldRect()
    return x >= rect.x && x <= rect.x + rect.width
      && y >= rect.y && y <= rect.y + rect.height
  }
}

export class UIContainer extends UIElement {
  private _direction: LayoutDirection = 'none'
  private _gap = 0
  private _padding: Insets = zeroInsets()
  private _align: LayoutAlignment = 'start'
  private _lastChildRevision = -1

  get direction(): LayoutDirection {
    return this._direction
  }

  set direction(value: LayoutDirection) {
    if (this._direction === value) return
    this._direction = value
    this.markLayoutDirty()
  }

  get gap(): number {
    return this._gap
  }

  set gap(value: number) {
    if (this._gap === value) return
    this._gap = value
    this.markLayoutDirty()
  }

  get padding(): Insets {
    return this._padding
  }

  set padding(value: Insets) {
    if (this._padding === value) return
    this._padding = value
    this.markLayoutDirty()
  }

  get align(): LayoutAlignment {
    return this._align
  }

  set align(value: LayoutAlignment) {
    if (this._align === value) return
    this._align = value
    this.markLayoutDirty()
  }

  onUpdate(dt: number): void {
    const ownLayoutNeeded = this.needsLayout()
    if (ownLayoutNeeded) {
      super.onUpdate(dt)
    }
    if (this.direction !== 'none' && (ownLayoutNeeded || this.needsChildLayout())) {
      this.layoutChildren()
      this._lastChildRevision = this.node?.childRevision ?? -1
    }
  }

  layoutChildren(): void {
    if (!this.node) return
    const horizontal = this.direction === 'horizontal'
    const originX = -this.node.anchorX * this.width
    const originY = -this.node.anchorY * this.height
    const items = this.node.children
      .map(node => ({ node, element: findUIElement(node) }))
      .filter((item): item is { node: Node, element: UIElement } => !!item.element)
    if (items.length === 0) return

    const mainSize = horizontal ? this.width : this.height
    const leading = horizontal ? this.padding.left : this.padding.top
    const trailing = horizontal ? this.padding.right : this.padding.bottom
    const fixed = items.reduce((sum, { element }) => {
      const size = horizontal ? element.width : element.height
      const margin = horizontal
        ? element.margin.left + element.margin.right
        : element.margin.top + element.margin.bottom
      return sum + (element.flex > 0 ? margin : size + margin)
    }, this.gap * Math.max(0, items.length - 1))
    const totalFlex = items.reduce((sum, item) => sum + item.element.flex, 0)
    const remaining = Math.max(0, mainSize - leading - trailing - fixed)
    let cursor = leading

    for (const { node, element } of items) {
      const marginBefore = horizontal ? element.margin.left : element.margin.top
      const marginAfter = horizontal ? element.margin.right : element.margin.bottom
      cursor += marginBefore
      if (element.flex > 0 && totalFlex > 0) {
        if (horizontal) element.width = remaining * element.flex / totalFlex
        else element.height = remaining * element.flex / totalFlex
      }

      const crossStart = horizontal ? this.padding.top : this.padding.left
      const crossEnd = horizontal ? this.padding.bottom : this.padding.right
      const crossAvailable = (horizontal ? this.height : this.width)
        - crossStart - crossEnd
      const crossSize = horizontal ? element.height : element.width
      let cross = crossStart
      if (this.align === 'center') cross += (crossAvailable - crossSize) * 0.5
      if (this.align === 'end') cross += crossAvailable - crossSize
      if (this.align === 'stretch') {
        if (horizontal) element.height = crossAvailable
        else element.width = crossAvailable
      }

      const t = node
      if (horizontal) {
        t.x = originX + cursor + element.width * t.anchorX
        t.y = originY + cross + element.height * t.anchorY
        cursor += element.width + marginAfter + this.gap
      } else {
        t.x = originX + cross + element.width * t.anchorX
        t.y = originY + cursor + element.height * t.anchorY
        cursor += element.height + marginAfter + this.gap
      }
    }
  }

  private needsChildLayout(): boolean {
    if (!this.node) return false
    if (this.node.childRevision !== this._lastChildRevision) return true
    for (const child of this.node.children) {
      const element = findUIElement(child)
      if (element?.layoutDirty) return true
    }
    return false
  }
}

export class Panel extends UIContainer {
  color: Color = { r: 30, g: 41, b: 59, a: 255 }
  opacity = 1

  onRender(): void {
    const rect = this.worldRect()
    sdl.drawRect(rect.x, rect.y, rect.width, rect.height,
      this.color.r, this.color.g, this.color.b,
      this.opacity * (this.color.a ?? 255))
  }
}

export class NineSlice extends UIElement {
  texturePath = ''
  region: TextureRegion | null = null
  border: Insets = { top: 12, right: 12, bottom: 12, left: 12 }
  color: Color = white()
  opacity = 1
  private texture: TextureAsset | null = null
  private loadedPath = ''

  setTexture(path: string, region: TextureRegion | null = null): this {
    if (path !== this.texturePath) this.releaseTexture()
    this.texturePath = path
    this.region = region
    return this
  }

  onRender(): void {
    this.ensureTexture()
    if (!this.texture) return
    const source = this.region ?? {
      x: 0, y: 0, width: this.texture.width, height: this.texture.height,
    }
    const rect = this.worldRect()
    const sourceW = splitSize(source.width, this.border.left, this.border.right)
    const sourceH = splitSize(source.height, this.border.top, this.border.bottom)
    const sourceX = [source.x, source.x + sourceW[0],
      source.x + source.width - sourceW[2]]
    const sourceY = [source.y, source.y + sourceH[0],
      source.y + source.height - sourceH[2]]
    const destW = splitSize(rect.width, sourceW[0], sourceW[2])
    const destH = splitSize(rect.height, sourceH[0], sourceH[2])
    let dy = rect.y
    for (let row = 0; row < 3; row++) {
      let dx = rect.x
      for (let column = 0; column < 3; column++) {
        if (sourceW[column] > 0 && sourceH[row] > 0
          && destW[column] > 0 && destH[row] > 0) {
          sdl.drawTextureRegionRotated(
            this.texture.id,
            sourceX[column], sourceY[row], sourceW[column], sourceH[row],
            dx, dy, destW[column], destH[row],
            0, 0, 0, false, false,
            this.color.r, this.color.g, this.color.b,
            this.opacity * (this.color.a ?? 255),
          )
        }
        dx += destW[column]
      }
      dy += destH[row]
    }
  }

  onDestroy(): void {
    this.releaseTexture()
  }

  private ensureTexture(): void {
    if (!this.texturePath) {
      this.releaseTexture()
      return
    }
    if (this.texture && this.loadedPath === this.texturePath) return
    this.releaseTexture()
    this.texture = AssetManager.acquireTexture(this.texturePath)
    this.loadedPath = this.texturePath
  }

  private releaseTexture(): void {
    this.texture?.release()
    this.texture = null
    this.loadedPath = ''
  }
}

export class UIImage extends NineSlice {
  border: Insets = zeroInsets()
}

export class Toggle extends UIElement {
  checked = false
  disabled = false
  onChange: ((checked: boolean) => void) | null = null
  trackOffColor: Color = { r: 71, g: 85, b: 105, a: 255 }
  trackOnColor: Color = { r: 59, g: 130, b: 246, a: 255 }
  thumbColor: Color = white()
  inputEnabled = true
  private pressed = false

  hitTest(x: number, y: number): boolean {
    return !this.disabled && this.containsPoint(x, y)
  }

  onPointerStart(event: InputEvent): void {
    this.pressed = true
    event.stopPropagation()
  }

  onPointerEnd(event: InputEvent): void {
    if (this.pressed && this.containsPoint(event.x, event.y)) {
      this.checked = !this.checked
      this.onChange?.(this.checked)
    }
    this.pressed = false
    event.stopPropagation()
  }

  onRender(): void {
    const rect = this.worldRect()
    const color = this.checked ? this.trackOnColor : this.trackOffColor
    sdl.drawRect(rect.x, rect.y, rect.width, rect.height,
      color.r, color.g, color.b, this.disabled ? 120 : color.a ?? 255)
    const thumb = Math.min(rect.height, rect.width * 0.5)
    const x = this.checked ? rect.x + rect.width - thumb : rect.x
    sdl.drawRect(x, rect.y, thumb, rect.height,
      this.thumbColor.r, this.thumbColor.g, this.thumbColor.b,
      this.disabled ? 160 : this.thumbColor.a ?? 255)
  }
}

export class ScrollView extends UIContainer {
  scrollX = 0
  scrollY = 0
  contentWidth = 0
  contentHeight = 0
  horizontal = false
  vertical = true
  inputEnabled = true
  inputPriority = 100
  private dragX = 0
  private dragY = 0
  private startScrollX = 0
  private startScrollY = 0
  private dragged = false

  onUpdate(dt: number): void {
    super.onUpdate(dt)
    this.clampScroll()
    const content = this.node?.children[0]
    if (content) {
      content.x = -this.node!.anchorX * this.width
        - this.scrollX
      content.y = -this.node!.anchorY * this.height
        - this.scrollY
    }
  }

  onRender(): void {
    const rect = this.worldRect()
    sdl.pushClipRect(rect.x, rect.y, rect.width, rect.height)
  }

  onRenderEnd(): void {
    sdl.popClipRect()
  }

  hitTest(x: number, y: number): boolean {
    return this.containsPoint(x, y)
  }

  allowsDescendantInput(x: number, y: number): boolean {
    return this.containsPoint(x, y)
  }

  onPointerStart(event: InputEvent): void {
    this.dragX = event.x
    this.dragY = event.y
    this.startScrollX = this.scrollX
    this.startScrollY = this.scrollY
    this.dragged = false
  }

  onPointerMove(event: InputEvent): void {
    this.dragged = this.dragged
      || Math.abs(event.x - this.dragX) > 4
      || Math.abs(event.y - this.dragY) > 4
    if (this.horizontal) this.scrollX = this.startScrollX - (event.x - this.dragX)
    if (this.vertical) this.scrollY = this.startScrollY - (event.y - this.dragY)
    this.clampScroll()
    if (this.dragged) event.stopPropagation()
  }

  onPointerEnd(event: InputEvent): void {
    if (this.dragged) event.stopPropagation()
  }

  scrollTo(x: number, y: number): this {
    this.scrollX = x
    this.scrollY = y
    this.clampScroll()
    return this
  }

  private clampScroll(): void {
    this.scrollX = Math.max(0, Math.min(
      Math.max(0, this.contentWidth - this.width), this.scrollX))
    this.scrollY = Math.max(0, Math.min(
      Math.max(0, this.contentHeight - this.height), this.scrollY))
  }
}

function findUIElement(node: Node | null): UIElement | null {
  if (!node) return null
  for (const component of node.components) {
    if (component instanceof UIElement) return component
  }
  return null
}

function splitSize(total: number, leading: number, trailing: number):
[number, number, number] {
  const edgeTotal = leading + trailing
  if (edgeTotal <= total) return [leading, total - edgeTotal, trailing]
  if (edgeTotal <= 0) return [0, total, 0]
  const scale = total / edgeTotal
  return [leading * scale, 0, trailing * scale]
}
