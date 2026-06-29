import { ComponentX } from './ComponentX'

export const DEFAULT_NODE_WIDTH = 0
export const DEFAULT_NODE_HEIGHT = 0

type Constructor<T = any> = new (...args: any[]) => T
type ComponentInput<T extends ComponentX> = Constructor<T> | T
type ScheduledCallback = (dt: number) => void
type EventCallback = (...args: any[]) => void

interface ScheduledEntry {
  callback: ScheduledCallback
  interval: number
  repeat: number
  delay: number
  elapsed: number
  timesExecuted: number
  useDelay: boolean
}

export class Node {
  declare name: string
  private _parent: Node | null = null
  children: Node[] = []
  components: ComponentX[] = []
  active = true
  private _width = DEFAULT_NODE_WIDTH
  private _height = DEFAULT_NODE_HEIGHT
  flipX = false
  flipY = false
  visible = true
  opacity = 1
  color: Color = { r: 255, g: 255, b: 255, a: 255 }
  zIndex = 0
  declare tag: Integer
  private _scheduledCallbacks: ScheduledEntry[] = []
  private _eventListeners = new Map<string, EventCallback[]>()
  private _childRevision = 0

  private _x = Number.NaN
  private _y = Number.NaN
  private _rotation = 0
  private _scaleX = 1
  private _scaleY = 1
  private _anchorX = 0.5
  private _anchorY = 0.5
  private _transformDirty = true
  private _worldX = 0
  private _worldY = 0
  private _worldRotation = 0
  private _worldScaleX = 1
  private _worldScaleY = 1
  constructor(name?: string) {
    this.name = name
  }

  get parent(): Node | null {
    return this._parent
  }

  set parent(value: Node | null) {
    if (this._parent === value) return
    this._parent = value
    this._markTransformDirty()
  }

  get childRevision(): number {
    return this._childRevision
  }

  get transformDirty(): boolean {
    return this._transformDirty
  }

  get width(): number {
    return this._width
  }

  set width(value: number) {
    if (this._width === value) return
    this._width = value
    this._markTransformDirty()
  }

  get height(): number {
    return this._height
  }

  set height(value: number) {
    if (this._height === value) return
    this._height = value
    this._markTransformDirty()
  }

  get x(): number {
    return Number.isNaN(this._x) ? 0 : this._x
  }

  set x(value: number) {
    if (Object.is(this._x, value)) return
    this._x = value
    this._markTransformDirty()
  }

  get y(): number {
    return Number.isNaN(this._y) ? 0 : this._y
  }

  set y(value: number) {
    if (Object.is(this._y, value)) return
    this._y = value
    this._markTransformDirty()
  }

  get hasExplicitPosition(): boolean {
    return !Number.isNaN(this._x) || !Number.isNaN(this._y)
  }

  get worldX(): number {
    this._ensureWorldTransform()
    return this._worldX
  }

  get worldY(): number {
    this._ensureWorldTransform()
    return this._worldY
  }

  get worldRotation(): number {
    this._ensureWorldTransform()
    return this._worldRotation
  }

  get worldScaleX(): number {
    this._ensureWorldTransform()
    return this._worldScaleX
  }

  get worldScaleY(): number {
    this._ensureWorldTransform()
    return this._worldScaleY
  }

  get rotation(): number {
    return this._rotation
  }

  set rotation(value: number) {
    if (this._rotation === value) return
    this._rotation = value
    this._markTransformDirty()
  }

  get scaleX(): number {
    return this._scaleX
  }

  set scaleX(value: number) {
    if (this._scaleX === value) return
    this._scaleX = value
    this._markTransformDirty()
  }

  get scaleY(): number {
    return this._scaleY
  }

  set scaleY(value: number) {
    if (this._scaleY === value) return
    this._scaleY = value
    this._markTransformDirty()
  }

  get anchorX(): number {
    return this._anchorX
  }

  set anchorX(value: number) {
    if (this._anchorX === value) return
    this._anchorX = value
    this._markTransformDirty()
  }

  get anchorY(): number {
    return this._anchorY
  }

  set anchorY(value: number) {
    if (this._anchorY === value) return
    this._anchorY = value
    this._markTransformDirty()
  }

  contentToWorld(x: number, y: number): Point {
    return this.localToWorld(
      x - this.anchorX * this.width,
      y - this.anchorY * this.height,
    )
  }

  localToWorld(x: number, y: number): Point {
    const radians = this.worldRotation * Math.PI / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const scaledX = x * this.worldScaleX
    const scaledY = y * this.worldScaleY

    return {
      x: this.worldX + scaledX * cos - scaledY * sin,
      y: this.worldY + scaledX * sin + scaledY * cos,
    }
  }

  get position(): Point {
    return { x: this.x, y: this.y }
  }

  set position(pos: Point) {
    this.x = pos.x
    this.y = pos.y
  }

  get xy(): [number, number] {
    return [this.x, this.y]
  }

  set xy([x, y]: [number, number]) {
    this.x = x
    this.y = y
  }

  setPosition(x: number, y: number) {
    this.x = x
    this.y = y
  }

  set scale(sx: number) {
    this.scaleX = sx
    this.scaleY = sx
  }

  addComponent<T extends ComponentX>(c: ComponentInput<T>, data?: ConstructorParameters<Constructor<T>>[0]): T {
    const component = typeof c === 'function' ? new c(data) : c
    if (component.node && component.node !== this) {
      const previousNode = component.node
      previousNode.components = previousNode.components.filter(item => item !== component)
      component.onNodeReassigned(previousNode, this)
    }
    component.node = this
    if (!this.components.includes(component)) {
      this.components.push(component)
    }
    component.onAwake()
    return component
  }

  resolveComponent<T extends ComponentX>(component: T) {
    if (component.node && component.node !== this) {
      this.addChild(component.node)
      return
    }
    this.addComponent(component)
  }

  getComponent<T extends ComponentX>(type: Constructor<T>): T | null {
    for (const c of this.components) {
      if (c instanceof type) return c as T
    }
    return null
  }

  addChild(child: Node, index?: number): Node {
    if (child.parent) child.removeFromParent()
    child.parent = this
    if (index !== undefined) {
      this.children.splice(index, 0, child)
    } else {
      this.children.push(child)
    }
    this._childRevision += 1
    return child
  }

  getRenderChildren(): Node[] {
    if (this.children.length < 2) return this.children
    return [...this.children].sort((a, b) => a.zIndex - b.zIndex)
  }

  removeFromParent(): void {
    if (!this.parent) return
    const idx = this.parent.children.indexOf(this)
    if (idx >= 0) {
      this.parent.children.splice(idx, 1)
      this.parent._childRevision += 1
    }
    this.parent = null
  }

  on(event: string, callback: EventCallback): this {
    const listeners = this._eventListeners.get(event) ?? []
    listeners.push(callback)
    this._eventListeners.set(event, listeners)
    return this
  }

  off(event: string, callback?: EventCallback): this {
    if (callback === undefined) {
      this._eventListeners.delete(event)
      return this
    }

    const listeners = this._eventListeners.get(event)
    if (!listeners) return this

    const nextListeners = listeners.filter(listener => listener !== callback)
    if (nextListeners.length > 0) {
      this._eventListeners.set(event, nextListeners)
    } else {
      this._eventListeners.delete(event)
    }

    return this
  }

  emit(event: string, ...args: any[]): this {
    const listeners = this._eventListeners.get(event)
    if (!listeners?.length) return this

    for (const listener of [...listeners]) {
      if (!this._eventListeners.get(event)?.includes(listener)) continue
      listener(...args)
    }

    return this
  }

  scheduleOnce(callback: ScheduledCallback, delay = 0): void {
    this.schedule(callback, 0, 0, delay)
  }

  schedule(
    callback: ScheduledCallback,
    interval = 0,
    repeat = Number.POSITIVE_INFINITY,
    delay = 0,
  ): void {
    this.unschedule(callback)
    this._scheduledCallbacks.push({
      callback,
      interval: Math.max(0, interval),
      repeat,
      delay: Math.max(0, delay),
      elapsed: 0,
      timesExecuted: 0,
      useDelay: delay > 0,
    })
  }

  unschedule(callback: ScheduledCallback): void {
    this._scheduledCallbacks = this._scheduledCallbacks.filter(entry => entry.callback !== callback)
  }

  unscheduleAllCallbacks(): void {
    this._scheduledCallbacks.length = 0
  }

  /** Internal: traverse update through tree. */
  _updateTree(dt: number): void {
    if (!this.active) return
    this._updateScheduledCallbacks(dt)
    for (let i = 0; i < this.components.length; i++) {
      this.components[i].onUpdate(dt)
    }
    for (let i = 0; i < this.children.length; i++) {
      this.children[i]._updateTree(dt)
    }
  }

  /** Internal: traverse render through tree. */
  _renderTree(): void {
    if (!this.active || !this.visible) return
    for (let i = 0; i < this.components.length; i++) {
      this.components[i].onRender()
    }
    const renderChildren = this.getRenderChildren()
    for (let i = 0; i < renderChildren.length; i++) {
      renderChildren[i]._renderTree()
    }
    for (let i = this.components.length - 1; i >= 0; i--) {
      this.components[i].onRenderEnd()
    }
  }

  /** Internal: start all components (called once on first tick). */
  _startTree(): void {
    for (const c of this.components) c.onStart()
    for (const child of this.children) child._startTree()
  }

  destroy(): void {
    this.unscheduleAllCallbacks()
    this._eventListeners.clear()
    for (const c of this.components) c.onDestroy()
    for (const child of [...this.children]) child.destroy()
    this.removeFromParent()
    this.components.length = 0
    this.children.length = 0
    this._childRevision += 1
  }

  private _markTransformDirty(): void {
    this._transformDirty = true
    for (const child of this.children) {
      child._markTransformDirty()
    }
  }

  private _ensureWorldTransform(): void {
    if (!this._transformDirty) return

    const parent = this.parent
    if (!parent) {
      this._worldX = this.x
      this._worldY = this.y
      this._worldRotation = this.rotation
      this._worldScaleX = this.scaleX
      this._worldScaleY = this.scaleY
      this._transformDirty = false
      return
    }

    const radians = parent.worldRotation * Math.PI / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const scaledX = this.x * parent.worldScaleX
    const scaledY = this.y * parent.worldScaleY

    this._worldX = parent.worldX + scaledX * cos - scaledY * sin
    this._worldY = parent.worldY + scaledX * sin + scaledY * cos
    this._worldRotation = parent.worldRotation + this.rotation
    this._worldScaleX = parent.worldScaleX * this.scaleX
    this._worldScaleY = parent.worldScaleY * this.scaleY
    this._transformDirty = false
  }

  private _updateScheduledCallbacks(dt: number): void {
    if (this._scheduledCallbacks.length === 0) return

    const callbacks = [...this._scheduledCallbacks]
    for (const entry of callbacks) {
      if (!this._scheduledCallbacks.includes(entry)) continue
      entry.elapsed += dt

      if (entry.useDelay) {
        if (entry.elapsed < entry.delay) continue
        entry.elapsed -= entry.delay
        entry.useDelay = false
        this._invokeScheduledCallback(entry, dt)
        if (!this._scheduledCallbacks.includes(entry)) continue
      }

      if (entry.interval <= 0) {
        while (this._scheduledCallbacks.includes(entry) && entry.elapsed >= 0) {
          entry.elapsed = 0
          this._invokeScheduledCallback(entry, dt)
          break
        }
        continue
      }

      while (this._scheduledCallbacks.includes(entry) && entry.elapsed >= entry.interval) {
        entry.elapsed -= entry.interval
        this._invokeScheduledCallback(entry, dt)
      }
    }
  }

  private _invokeScheduledCallback(entry: ScheduledEntry, dt: number): void {
    entry.callback(dt)
    entry.timesExecuted += 1
    if (entry.timesExecuted > entry.repeat) {
      this.unschedule(entry.callback)
    }
  }

  getComponentsInChildren<T extends ComponentX>(component: Constructor<T>): T[] {
    if (!this.children.length) {
      return []
    }
    const listHave = this.children.filter((child) => {
      return child.getComponent(component)
    })
    return listHave.map(node => node.getComponent(component))
  }

  getComponentInChildren<T extends ComponentX>(component: Constructor<T>): T {
    return this.getComponentsInChildren(component)[0]
  }

  hasComponentInChildren<T extends ComponentX>(component: Constructor<T>) {
    if (!this.children.length) {
      return false
    }
    return this.children.some((child) => {
      return child.getComponent(component)
    })
  }
}
