import * as sdl from 'sdl3'
import { ComponentX } from '../core/ComponentX'
import type { Node } from '../core/Node'
import { white } from '../helper/constants'
import type { InputEvent } from '../Input'

export type LayoutDirection = 'none' | 'horizontal' | 'vertical' | 'grid'
export type LayoutAlignment = 'start' | 'center' | 'end' | 'stretch'

// Attach to child nodes to control flex and margin in layout containers
export class LayoutChild extends ComponentX {
  flex = 0
  margin: [number, number, number, number] = [0, 0, 0, 0]
}

function getLayoutChild(node: Node): LayoutChild | null {
  return node.getComponent(LayoutChild)
}

function marginLeft(c: LayoutChild | null): number { return c ? c.margin[3] : 0 }
function marginRight(c: LayoutChild | null): number { return c ? c.margin[1] : 0 }
function marginTop(c: LayoutChild | null): number { return c ? c.margin[0] : 0 }
function marginBottom(c: LayoutChild | null): number { return c ? c.margin[2] : 0 }

// --- UIContainer: horizontal / vertical layout --------------------------------

interface UIContainerProps {
  direction?: LayoutDirection
  gap?: number
  paddingTop?: number
  paddingLeft?: number
  paddingRight?: number
  paddingBottom?: number
}

export class UIContainer<Props = UIContainerProps> extends ComponentX<Props> {
  private _align: LayoutAlignment = 'start'
  private _lastChildRevision = -1

  private get _p(): Required<UIContainerProps> {
    return { direction: 'none', gap: 0, paddingTop: 0, paddingLeft: 0, paddingRight: 0, paddingBottom: 0, ...this.props as any }
  }

  get align(): LayoutAlignment { return this._align }
  set align(v: LayoutAlignment) { this._align = v }

  onUpdate(_dt: number): void {
    const dir = this._p.direction
    if (dir !== 'none' && this.needsChildLayout()) {
      this.layoutChildren()
      this._lastChildRevision = this.node?.childRevision ?? -1
    }
  }

  private needsChildLayout(): boolean {
    return this.node?.childRevision !== this._lastChildRevision
  }

  layoutChildren(): void {
    const n = this.node
    if (!n) return
    const p = this._p
    const horizontal = p.direction === 'horizontal'
    const ox = -n.anchorX * n.width
    const oy = -n.anchorY * n.height
    const kids = n.children
    if (kids.length === 0) return

    const { paddingTop: pt, paddingRight: pr, paddingBottom: pb, paddingLeft: pl } = p
    const mainSize = horizontal ? n.width : n.height
    const leading = horizontal ? pl : pt
    const trailing = horizontal ? pr : pb

    let fixed = 0
    let totalFlex = 0
    const margins: { before: number; after: number }[] = []
    for (const child of kids) {
      const lc = getLayoutChild(child)
      margins.push({
        before: horizontal ? marginLeft(lc) : marginTop(lc),
        after: horizontal ? marginRight(lc) : marginBottom(lc),
      })
      const size = horizontal ? child.width : child.height
      const marginSum = margins[margins.length - 1].before + margins[margins.length - 1].after
      if (lc && lc.flex > 0) {
        totalFlex += lc.flex
        fixed += marginSum
      } else {
        fixed += size + marginSum
      }
    }
    fixed += p.gap * Math.max(0, kids.length - 1)
    const remaining = Math.max(0, mainSize - leading - trailing - fixed)

    let cursor = leading
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i]
      const lc = getLayoutChild(child)
      const m = margins[i]
      cursor += m.before
      if (lc && lc.flex > 0 && totalFlex > 0) {
        if (horizontal) child.width = remaining * lc.flex / totalFlex
        else child.height = remaining * lc.flex / totalFlex
      }

      const crossSize = horizontal ? child.height : child.width
      const crossW = horizontal ? n.height : n.width
      const crossStart = horizontal ? pt : pl
      const crossEnd = horizontal ? pb : pr
      const crossAvail = crossW - crossStart - crossEnd
      let cross = crossStart
      if (this._align === 'center') cross += (crossAvail - crossSize) * 0.5
      if (this._align === 'end') cross += crossAvail - crossSize
      if (this._align === 'stretch') {
        if (horizontal) child.height = crossAvail
        else child.width = crossAvail
      }

      if (horizontal) {
        child.x = ox + cursor + child.width * child.anchorX
        child.y = oy + cross + child.height * child.anchorY
        cursor += child.width + m.after + p.gap
      } else {
        child.x = ox + cross + child.width * child.anchorX
        child.y = oy + cursor + child.height * child.anchorY
        cursor += child.height + m.after + p.gap
      }
    }
  }
}

// --- UILayout: horizontal / vertical / grid (props-based) ---------------------

interface UILayoutProps {
  direction?: LayoutDirection
  gap?: number
  paddingTop?: number
  paddingLeft?: number
  paddingRight?: number
  paddingBottom?: number
}

export class UILayout extends ComponentX<UILayoutProps> {
  private _lastChildRevision = -1
  private _childSizes = new WeakMap<Node, { w: number; h: number }>()

  private get _p(): Required<UILayoutProps> {
    return { direction: 'horizontal', gap: 0, paddingTop: 0, paddingLeft: 0, paddingRight: 0, paddingBottom: 0, ...this.props }
  }

  onRender() { }

  onUpdate(_dt: number): void {
    const dir = this._p.direction
    if (dir !== 'none' && this.needsChildLayout()) {
      this.layoutChildren()
      this._snapshotChildSizes()
      this._lastChildRevision = this.node?.childRevision ?? -1
    }
  }

  private _snapshotChildSizes(): void {
    for (const child of this.node?.children ?? []) {
      this._childSizes.set(child, { w: child.width, h: child.height })
    }
  }

  private needsChildLayout(): boolean {
    const n = this.node
    if (!n) return false
    if (n.childRevision !== this._lastChildRevision) return true
    for (const child of n.children) {
      const prev = this._childSizes.get(child)
      if (!prev || prev.w !== child.width || prev.h !== child.height) return true
    }
    return false
  }

  layoutChildren(): void {
    const n = this.node
    if (!n) return
    const p = this._p
    const ox = -n.anchorX * n.width
    const oy = -n.anchorY * n.height
    const kids = n.children
    if (kids.length === 0) return

    const { paddingTop: pt, paddingRight: pr, paddingBottom: pb, paddingLeft: pl } = p

    if (p.direction === 'horizontal')
      this.layoutH(kids, ox, oy, pt, pr, pb, pl, p)
    else if (p.direction === 'vertical')
      this.layoutV(kids, ox, oy, pt, pr, pb, pl, p)
    else if (p.direction === 'grid')
      this.layoutG(kids, ox, oy, pt, pr, pb, pl, p)
  }

  private layoutH(
    kids: Node[], ox: number, oy: number,
    _pt: number, pr: number, _pb: number, pl: number,
    p: Required<UILayoutProps>,
  ): void {
    const availW = nWidth(this.node) - pl - pr
    let fixed = 0
    let totalF = 0
    for (const child of kids) {
      const lc = getLayoutChild(child)
      if (lc && lc.flex > 0) { totalF += lc.flex; fixed += 0 }
      else fixed += child.width
    }
    fixed += p.gap * (kids.length - 1)
    let cursor = pl
    for (const child of kids) {
      const lc = getLayoutChild(child)
      if (lc && lc.flex > 0 && totalF > 0)
        child.width = (availW - fixed) * lc.flex / totalF
      child.x = ox + cursor + child.width * child.anchorX
      child.y = oy + _pt + child.height * child.anchorY
      cursor += child.width + p.gap
    }
  }

  private layoutV(
    kids: Node[], ox: number, oy: number,
    pt: number, _pr: number, pb: number, _pl: number,
    p: Required<UILayoutProps>,
  ): void {
    const availH = nHeight(this.node) - pt - pb
    let fixed = 0
    let totalF = 0
    for (const child of kids) {
      const lc = getLayoutChild(child)
      if (lc && lc.flex > 0) { totalF += lc.flex; fixed += 0 }
      else fixed += child.height
    }
    fixed += p.gap * (kids.length - 1)
    let cursor = pt
    for (const child of kids) {
      const lc = getLayoutChild(child)
      if (lc && lc.flex > 0 && totalF > 0)
        child.height = (availH - fixed) * lc.flex / totalF
      child.x = ox + p.paddingLeft + child.width * child.anchorX
      child.y = oy + cursor + child.height * child.anchorY
      cursor += child.height + p.gap
    }
  }

  private layoutG(
    kids: Node[], ox: number, oy: number,
    pt: number, pr: number, pb: number, pl: number,
    p: Required<UILayoutProps>,
  ): void {
    const availW = nWidth(this.node) - pl - pr
    const availH = nHeight(this.node) - pt - pb
    const cols = Math.max(1, Math.round(Math.sqrt(kids.length * availW / Math.max(1, availH))))
    const rows = Math.ceil(kids.length / cols)
    const cellW = (availW - p.gap * (cols - 1)) / cols
    const cellH = (availH - p.gap * (rows - 1)) / rows
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i]
      const col = i % cols
      const row = Math.floor(i / cols)
      child.x = ox + pl + col * (cellW + p.gap) + child.width * child.anchorX
      child.y = oy + pt + row * (cellH + p.gap) + child.height * child.anchorY
    }
  }
}

function nWidth(node: Node | null): number { return node?.width ?? 0 }
function nHeight(node: Node | null): number { return node?.height ?? 0 }

export function worldRect(n: Node): { x: number; y: number; width: number; height: number } {
  const w = n.width * Math.abs(n.worldScaleX)
  const h = n.height * Math.abs(n.worldScaleY)
  return { x: n.worldX - n.anchorX * w, y: n.worldY - n.anchorY * h, width: w, height: h }
}

export function containsPoint(n: Node, x: number, y: number): boolean {
  const r = worldRect(n)
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
}

// --- Toggle ------------------------------------------------------------------

export class Toggle extends ComponentX {
  checked = false
  disabled = false
  onChange: ((checked: boolean) => void) | null = null
  trackOffColor: Color = { r: 71, g: 85, b: 105, a: 255 }
  trackOnColor: Color = { r: 59, g: 130, b: 246, a: 255 }
  thumbColor: Color = white()
  inputEnabled = true
  private pressed = false

  private worldRect(): { x: number; y: number; width: number; height: number } {
    return worldRect(this.node)
  }

  private containsPoint(x: number, y: number): boolean {
    return containsPoint(this.node, x, y)
  }

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

// --- ScrollView --------------------------------------------------------------

interface ScrollViewProps {
  viewSize: Size
  contentSize: Size
  horizontal?: boolean
  vertical?: boolean
  isScrollToTop?: boolean
  isBounced?: boolean
  onScroll?: (offset: Vec2) => void
}

export class ScrollView extends UIContainer<ScrollViewProps> {
  scrollX = 0
  scrollY = 0
  inputEnabled = true
  inputPriority = 100
  private dragX = 0
  private dragY = 0
  private startScrollX = 0
  private startScrollY = 0
  private dragged = false

  onUpdate(dt: number): void {
    const n = this.node
    n.width = this.props.viewSize.width
    n.height = this.props.viewSize.height
    super.onUpdate(dt)
    this.syncContentNodeSize()
    this.clampScroll()
    const content = n.children[0]
    if (content) {
      content.x = -n.anchorX * this.props.viewSize.width - this.scrollX
      content.y = -n.anchorY * this.props.viewSize.height - this.scrollY
    }
  }

  onRender(): void {
    const n = this.node
    const x = n.worldX - n.anchorX * n.width * Math.abs(n.worldScaleX)
    const y = n.worldY - n.anchorY * n.height * Math.abs(n.worldScaleY)
    sdl.pushClipRect(x, y, n.width * Math.abs(n.worldScaleX), n.height * Math.abs(n.worldScaleY))
  }

  onRenderEnd(): void {
    sdl.popClipRect()
  }

  hitTest(x: number, y: number): boolean {
    const n = this.node
    const w = n.width * Math.abs(n.worldScaleX)
    const h = n.height * Math.abs(n.worldScaleY)
    const rx = n.worldX - n.anchorX * w
    const ry = n.worldY - n.anchorY * h
    return x >= rx && x <= rx + w && y >= ry && y <= ry + h
  }

  allowsDescendantInput(x: number, y: number): boolean {
    return this.hitTest(x, y)
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
    if (this.props.horizontal) this.scrollX = this.startScrollX - (event.x - this.dragX)
    if (this.props.vertical) this.scrollY = this.startScrollY - (event.y - this.dragY)
    this.clampScroll()
    if (this.dragged) event.stopPropagation()
  }

  onPointerEnd(event: InputEvent): void {
    if (this.dragged) event.stopPropagation()
  }

  scrollTo(x: number, y: number) {
    this.scrollX = x
    this.scrollY = y
    this.clampScroll()
  }

  setInnerContainerSize(size: Size) {
    this.props.contentSize = size
    this.syncContentNodeSize()
    this.clampScroll()
  }

  private syncContentNodeSize(): void {
    const content = this.node?.children[0]
    if (!content) return
    content.width = this.props.contentSize.width
    content.height = this.props.contentSize.height
  }

  private clampScroll(): void {
    this.scrollX = Math.max(0, Math.min(
      Math.max(0, this.props.contentSize.width - this.props.viewSize.width), this.scrollX))
    this.scrollY = Math.max(0, Math.min(
      Math.max(0, this.props.contentSize.height - this.props.viewSize.height), this.scrollY))
  }
}
