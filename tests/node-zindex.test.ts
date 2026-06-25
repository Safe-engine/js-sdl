import { describe, expect, test } from 'bun:test';
import { ComponentX } from '../engine/core/ComponentX';
import { Node } from '../engine/core/Node';
import { InputSystem } from '../engine/Input';

class RenderRecorder extends ComponentX<{ id: string, log: string[] }> {
  onRender(): void {
    this.props.log.push(this.props.id);
  }
}

class HitRecorder extends ComponentX<{ id: string, log: string[] }> {
  inputEnabled = true;

  hitTest(): boolean {
    return true;
  }

  onPointerStart(): void {
    this.props.log.push(this.props.id);
  }
}

describe('Node zIndex', () => {
  test('renders siblings by ascending zIndex and preserves sibling order on ties', () => {
    const root = new Node('root');
    const log: string[] = [];

    const middle = new Node('middle');
    middle.zIndex = 1;
    middle.addComponent(RenderRecorder, { id: 'middle', log });

    const front = new Node('front');
    front.zIndex = 5;
    front.addComponent(RenderRecorder, { id: 'front', log });

    const back = new Node('back');
    back.zIndex = -3;
    back.addComponent(RenderRecorder, { id: 'back', log });

    const tied = new Node('tied');
    tied.zIndex = 1;
    tied.addComponent(RenderRecorder, { id: 'tied', log });

    root.addChild(middle);
    root.addChild(front);
    root.addChild(back);
    root.addChild(tied);

    root._renderTree();

    expect(log).toEqual(['back', 'middle', 'tied', 'front']);
  });

  test('dispatches input to the visually topmost sibling first', () => {
    const root = new Node('root');
    const log: string[] = [];
    const input = new InputSystem(root);

    const low = new Node('low');
    low.zIndex = 0;
    low.addComponent(HitRecorder, { id: 'low', log });

    const high = new Node('high');
    high.zIndex = 10;
    high.addComponent(HitRecorder, { id: 'high', log });

    root.addChild(low);
    root.addChild(high);

    input.dispatchStart(0, 0);

    expect(log).toEqual(['high', 'low']);
  });
});
