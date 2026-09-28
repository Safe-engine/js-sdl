import type { InputEvent } from '../Input'
import { Node } from './Node'
export interface BaseComponentProps<T> {
  $ref?: T
  $push?: T[]
  $refNode?: Node
  $pushNode?: Node[]
  children?: unknown
  node?: Partial<Node>
  // [$key: `$${string}`]: string
}
export type Constructor<T = any> = new (...args: any[]) => T

export class ComponentX<Props = unknown> {
  props: Props = {} as any
  declare node: Node
  inputEnabled = false
  inputPriority = 0
  /** Engine-internal: backing field of `enabled`, read directly by tree traversal. */
  _enabled = true
  /** Engine-internal: whether onEnable has run without a matching onDisable. */
  _enableCalled = false
  __view?()
  private readonly scheduledCallbacks
    = new WeakMap<(arg: any) => void, (arg: any) => void>()

  constructor(data?: BaseComponentProps<ComponentX> & Props) {
    this.init(data)
  }

  /**
   * Disabled components are skipped by update, render and input. Changing it
   * calls onEnable/onDisable once the node is started and active in hierarchy.
   */
  get enabled(): boolean {
    return this._enabled
  }

  set enabled(value: boolean) {
    if (this._enabled === value) return
    this._enabled = value
    this.node?._syncComponentEnabled(this)
  }

  init(data?: Props) {
    if (data) {
      // console.log('constructor', this.constructor.name, data)
      Object.keys(data).forEach((key) => {
        this.props[key] = data[key]
      })
    }
  }

  addComponent<T extends ComponentX>(component: Constructor<T> | T, data?: ConstructorParameters<Constructor<T>>[0]): T {
    return this.ensureNode().addComponent(component, data)
  }

  getComponent<T extends ComponentX>(component: Constructor<T>): T {
    return this.node.getComponent(component)
  }

  ensureNode(name = this.constructor.name): Node {
    if (!this.node) {
      new Node(name).addComponent(this)
    }
    return this.node
  }

  schedule(callback: (arg: any) => void, interval: number, repeat?: number, delay?) {
    this.node.schedule(
      this.resolveScheduledCallback(callback),
      interval,
      repeat,
      delay,
    )
  }

  unschedule(callback: (arg: any) => void) {
    this.node.unschedule(this.resolveScheduledCallback(callback))
  }

  unscheduleAllCallbacks() {
    this.node.unscheduleAllCallbacks()
  }

  scheduleOnce(callback: (arg: any) => void, delay?: number) {
    this.node.scheduleOnce(this.resolveScheduledCallback(callback), delay)
  }

  /** Components on direct children only; see getComponentsInDescendants. */
  getComponentsInChildren<T extends ComponentX>(component: Constructor<T>): T[] {
    return this.node.getComponentsInChildren(component)
  }

  getComponentsInDescendants<T extends ComponentX>(component: Constructor<T>): T[] {
    return this.node.getComponentsInDescendants(component)
  }

  getComponentInChildren<T extends ComponentX>(component: Constructor<T>): T {
    return this.node.getComponentInChildren(component)
  }

  isEqual(other: ComponentX) {
    return this.node === other.node
  }

  onAwake(): void { }
  /** Called when the component becomes enabled and active in hierarchy (before its first onStart). */
  onEnable(): void { }
  /** Called when the component stops being enabled and active in hierarchy, including before onDestroy. */
  onDisable(): void { }
  onStart(): void { }
  onUpdate(_dt: number): void { }
  onRender(): void { }
  onRenderEnd(): void { }
  onNodeReassigned(_previousNode: Node, _nextNode: Node): void { }
  onDestroy(): void { }

  hitTest(_x: number, _y: number): boolean {
    return false
  }

  allowsDescendantInput(_x: number, _y: number): boolean {
    return true
  }

  onPointerStart(_event: InputEvent): void { }
  onPointerMove(_event: InputEvent): void { }
  onPointerEnd(_event: InputEvent): void { }

  private resolveScheduledCallback(callback: (arg: any) => void) {
    let bound = this.scheduledCallbacks.get(callback)
    if (!bound) {
      bound = callback.bind(this)
      this.scheduledCallbacks.set(callback, bound)
    }
    return bound
  }
}
