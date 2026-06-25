import { ComponentX } from './core/ComponentX';
import { Node } from './core/Node';

export type InputEventType = 'start' | 'move' | 'end';

export class InputEvent {
  readonly type: InputEventType;
  readonly x: number;
  readonly y: number;
  readonly target: ComponentX;
  currentTarget: ComponentX;
  propagationStopped = false;

  constructor(
    type: InputEventType,
    x: number,
    y: number,
    target: ComponentX,
  ) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.target = target;
    this.currentTarget = target;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

interface InputCandidate {
  component: ComponentX
  renderOrder: number
}

export class InputSystem {
  private captured: ComponentX[] = [];

  constructor(private readonly root: Node) {}

  dispatchStart(x: number, y: number): boolean {
    const candidates = this.collectCandidates(x, y);
    this.captured = [];
    if (candidates.length === 0) return false;

    const event = new InputEvent('start', x, y, candidates[0].component);
    for (const candidate of candidates) {
      const component = candidate.component;
      event.currentTarget = component;
      this.captured.push(component);
      component.onPointerStart(event);
      if (event.propagationStopped) break;
    }
    return event.propagationStopped;
  }

  dispatchMove(x: number, y: number): boolean {
    return this.dispatchCaptured('move', x, y);
  }

  dispatchEnd(x: number, y: number): boolean {
    const stopped = this.dispatchCaptured('end', x, y);
    this.captured = [];
    return stopped;
  }

  reset(): void {
    this.captured = [];
  }

  private dispatchCaptured(
    type: Exclude<InputEventType, 'start'>,
    x: number,
    y: number,
  ): boolean {
    const captured = this.captured.filter(component =>
      component.inputEnabled && this.isActive(component.node)
    );
    if (captured.length === 0) return false;

    const event = new InputEvent(type, x, y, captured[0]);
    for (const component of captured) {
      event.currentTarget = component;
      if (type === 'move') {
        component.onPointerMove(event);
      } else {
        component.onPointerEnd(event);
      }
      if (event.propagationStopped) break;
    }
    return event.propagationStopped;
  }

  private collectCandidates(x: number, y: number): InputCandidate[] {
    const candidates: InputCandidate[] = [];
    let renderOrder = 0;

    const visit = (node: Node): void => {
      if (!node.active) return;
      let allowChildren = true;
      for (const component of node.components) {
        if (component.inputEnabled && component.hitTest(x, y)) {
          candidates.push({ component, renderOrder });
        }
        if (!component.allowsDescendantInput(x, y)) allowChildren = false;
        renderOrder++;
      }
      if (allowChildren) {
        for (const child of node.getRenderChildren()) visit(child);
      }
    };

    visit(this.root);
    candidates.sort((a, b) =>
      b.component.inputPriority - a.component.inputPriority
      || b.renderOrder - a.renderOrder
    );
    return candidates;
  }

  private isActive(node: Node | null): boolean {
    for (let current = node; current; current = current.parent) {
      if (!current.active) return false;
    }
    return node !== null;
  }
}
