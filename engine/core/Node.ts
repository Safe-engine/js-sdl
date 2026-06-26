import { ComponentX } from './ComponentX'

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
  parent: Node | null = null
  children: Node[] = []
  components: ComponentX[] = []
  active = true
  width = 64
  height = 64
  flipX = false
  flipY = false
  visible = true
  opacity = 1
  color: Color = { r: 255, g: 255, b: 255, a: 255 }
  zIndex = 0
  declare tag: Integer
  private _scheduledCallbacks: ScheduledEntry[] = []
  private _eventListeners = new Map<string, EventCallback[]>()

  x = 0
  y = 0
  rotation = 0
  scaleX = 1
  scaleY = 1
  anchorX = 0.5
  anchorY = 0.5
  constructor(name?: string) {
    this.name = name
  }

  get worldX(): number {
    const pt = this._getParentTransform()
    return pt ? pt.contentToWorld(this.x, this.y).x : this.x
  }

  get worldY(): number {
    const pt = this._getParentTransform()
    return pt ? pt.contentToWorld(this.x, this.y).y : this.y
  }

  get worldRotation(): number {
    const pt = this._getParentTransform()
    return (pt?.worldRotation ?? 0) + this.rotation
  }

  get worldScaleX(): number {
    const pt = this._getParentTransform()
    return (pt?.worldScaleX ?? 1) * this.scaleX
  }

  get worldScaleY(): number {
    const pt = this._getParentTransform()
    return (pt?.worldScaleY ?? 1) * this.scaleY
  }

  private _getParentTransform() {
    const p = this.parent ?? null
    return p
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

  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }

  set scale(sx: number) {
    this.scaleX = sx
    this.scaleY = sx
  }

  addComponent<T extends ComponentX>(c: ComponentInput<T>, data?: ConstructorParameters<Constructor<T>>[0]): T {
    const component = typeof c === 'function' ? new c(data) : c
    if (component.node && component.node !== this) {
      component.node.components = component.node.components.filter(item => item !== component)
    }
    component.node = this
    if (!this.components.includes(component)) {
      this.components.push(component)
    }
    component.onAwake()
    return component
  }

  resolveComponent<T extends ComponentX>(component: T) {
    if ((component as any).__view) {
      this.addChild(component.node)
    } else if ((component as any).__explicitNode && component.node !== this) {
      this.addChild(component.node)
    } else {
      this.addComponent(component)
    }
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
    return child
  }

  getRenderChildren(): Node[] {
    if (this.children.length < 2) return this.children
    return [...this.children].sort((a, b) => a.zIndex - b.zIndex)
  }

  removeFromParent(): void {
    if (!this.parent) return
    const idx = this.parent.children.indexOf(this)
    if (idx >= 0) this.parent.children.splice(idx, 1)
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
    if (!this.active) return
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
