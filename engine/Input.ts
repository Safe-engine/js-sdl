import { ComponentX } from './core/ComponentX'
import { Node } from './core/Node'

export type InputEventType = 'start' | 'move' | 'end'

export class Touch {
  readonly type: InputEventType
  readonly x: number
  readonly y: number
  readonly previousX: number
  readonly previousY: number
  readonly target: ComponentX | null
  currentTarget: ComponentX | null
  propagationStopped = false

  constructor(
    type: InputEventType,
    x: number,
    y: number,
    target: ComponentX | null,
    previousX = x,
    previousY = y,
  ) {
    this.type = type
    this.x = x
    this.y = y
    this.previousX = previousX
    this.previousY = previousY
    this.target = target
    this.currentTarget = target
  }

  getLocation(): Vec2 {
    return { x: this.x, y: this.y }
  }

  getLocationX(): number {
    return this.x
  }

  getLocationY(): number {
    return this.y
  }

  getDelta(): Vec2 {
    return {
      x: this.x - this.previousX,
      y: this.y - this.previousY,
    }
  }

  getDeltaX(): number {
    return this.x - this.previousX
  }

  getDeltaY(): number {
    return this.y - this.previousY
  }

  stopPropagation(): void {
    this.propagationStopped = true
  }
}

export class InputEvent extends Touch {
  declare readonly target: ComponentX
  declare currentTarget: ComponentX

  constructor(
    type: InputEventType,
    x: number,
    y: number,
    target: ComponentX,
    previousX = x,
    previousY = y,
  ) {
    super(type, x, y, target, previousX, previousY)
  }
}

/** How a camera sees the scene: which nodes it renders and how screen maps to world. */
export interface InputView {
  mask: number
  toWorld(x: number, y: number): Vec2
}

const SCREEN_VIEW: InputView = {
  mask: 0xffffffff,
  toWorld: (x, y) => ({ x, y }),
}

interface InputCandidate {
  component: ComponentX
  view: InputView
  renderOrder: number
}

interface CapturedInput {
  component: ComponentX
  view: InputView
  lastX: number
  lastY: number
}

export class InputSystem {
  private captured: CapturedInput[] = []

  constructor(private readonly root: Node) {}

  /**
   * Dispatch a pointer press. `views` lists the cameras in render order; nodes
   * drawn later are hit first and receive coordinates in that camera's world.
   */
  dispatchStart(x: number, y: number, views: readonly InputView[] = [SCREEN_VIEW]): boolean {
    const candidates = this.collectCandidates(x, y, views)
    this.captured = []
    if (candidates.length === 0) return false

    const target = candidates[0].component
    let stopped = false
    for (const { component, view } of candidates) {
      const point = view.toWorld(x, y)
      const event = new InputEvent('start', point.x, point.y, target)
      event.currentTarget = component
      this.captured.push({ component, view, lastX: point.x, lastY: point.y })
      component.onPointerStart(event)
      if (event.propagationStopped) {
        stopped = true
        break
      }
    }
    return stopped
  }

  dispatchMove(x: number, y: number): boolean {
    return this.dispatchCaptured('move', x, y)
  }

  dispatchEnd(x: number, y: number): boolean {
    const stopped = this.dispatchCaptured('end', x, y)
    this.captured = []
    return stopped
  }

  reset(): void {
    this.captured = []
  }

  private dispatchCaptured(
    type: Exclude<InputEventType, 'start'>,
    x: number,
    y: number,
  ): boolean {
    const captured = this.captured.filter(({ component }) =>
      component.inputEnabled && this.isInteractive(component.node)
    )
    if (captured.length === 0) return false

    const target = captured[0].component
    for (const entry of captured) {
      const point = entry.view.toWorld(x, y)
      const event = new InputEvent(type, point.x, point.y, target, entry.lastX, entry.lastY)
      event.currentTarget = entry.component
      entry.lastX = point.x
      entry.lastY = point.y
      if (type === 'move') {
        entry.component.onPointerMove(event)
      } else {
        entry.component.onPointerEnd(event)
      }
      if (event.propagationStopped) return true
    }
    return false
  }

  private collectCandidates(x: number, y: number, views: readonly InputView[]): InputCandidate[] {
    const byComponent = new Map<ComponentX, InputCandidate>()
    let renderOrder = 0

    for (const view of views) {
      const point = view.toWorld(x, y)
      const visit = (node: Node): void => {
        if (!node.active || !node.visible) return
        let allowChildren = true
        // Mirrors Node._renderTree: a masked-out node hides only its own components.
        if ((view.mask & node.cameraMask) !== 0) {
          for (const component of node.components) {
            if (component.inputEnabled && component.hitTest(point.x, point.y)) {
              // A later camera draws on top, so its hit replaces an earlier one.
              byComponent.set(component, { component, view, renderOrder })
            }
            if (!component.allowsDescendantInput(point.x, point.y)) allowChildren = false
            renderOrder++
          }
        }
        if (allowChildren) {
          for (const child of node.getRenderChildren()) visit(child)
        }
      }
      visit(this.root)
    }

    return [...byComponent.values()].sort((a, b) =>
      b.component.inputPriority - a.component.inputPriority
      || b.renderOrder - a.renderOrder
    )
  }

  private isInteractive(node: Node | null): boolean {
    for (let current = node; current; current = current.parent) {
      if (!current.active || !current.visible) return false
    }
    return node !== null
  }
}
