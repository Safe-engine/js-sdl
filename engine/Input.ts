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

interface InputCandidate {
  component: ComponentX
  renderOrder: number
}

export class InputSystem {
  private captured: ComponentX[] = []
  private lastX: number | null = null
  private lastY: number | null = null

  constructor(private readonly root: Node) {}

  dispatchStart(x: number, y: number): boolean {
    const candidates = this.collectCandidates(x, y)
    this.captured = []
    if (candidates.length === 0) return false

    this.lastX = x
    this.lastY = y
    const event = new InputEvent('start', x, y, candidates[0].component)
    for (const candidate of candidates) {
      const component = candidate.component
      event.currentTarget = component
      this.captured.push(component)
      component.onPointerStart(event)
      if (event.propagationStopped) break
    }
    return event.propagationStopped
  }

  dispatchMove(x: number, y: number): boolean {
    return this.dispatchCaptured('move', x, y)
  }

  dispatchEnd(x: number, y: number): boolean {
    const stopped = this.dispatchCaptured('end', x, y)
    this.captured = []
    this.lastX = null
    this.lastY = null
    return stopped
  }

  reset(): void {
    this.captured = []
    this.lastX = null
    this.lastY = null
  }

  private dispatchCaptured(
    type: Exclude<InputEventType, 'start'>,
    x: number,
    y: number,
  ): boolean {
    const captured = this.captured.filter(component =>
      component.inputEnabled && this.isInteractive(component.node)
    )
    if (captured.length === 0) return false

    const previousX = this.lastX ?? x
    const previousY = this.lastY ?? y
    const event = new InputEvent(type, x, y, captured[0], previousX, previousY)
    this.lastX = x
    this.lastY = y
    for (const component of captured) {
      event.currentTarget = component
      if (type === 'move') {
        component.onPointerMove(event)
      } else {
        component.onPointerEnd(event)
      }
      if (event.propagationStopped) break
    }
    return event.propagationStopped
  }

  private collectCandidates(x: number, y: number): InputCandidate[] {
    const candidates: InputCandidate[] = []
    let renderOrder = 0

    const visit = (node: Node): void => {
      if (!node.active || !node.visible) return
      let allowChildren = true
      for (const component of node.components) {
        if (component.inputEnabled && component.hitTest(x, y)) {
          candidates.push({ component, renderOrder })
        }
        if (!component.allowsDescendantInput(x, y)) allowChildren = false
        renderOrder++
      }
      if (allowChildren) {
        for (const child of node.getRenderChildren()) visit(child)
      }
    }

    visit(this.root)
    candidates.sort((a, b) =>
      b.component.inputPriority - a.component.inputPriority
      || b.renderOrder - a.renderOrder
    )
    return candidates
  }

  private isInteractive(node: Node | null): boolean {
    for (let current = node; current; current = current.parent) {
      if (!current.active || !current.visible) return false
    }
    return node !== null
  }
}
