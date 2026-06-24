import { describe, expect, test } from 'bun:test';
import {
  BoxCollider,
  CircleCollider,
  CollideSystem,
  PolygonCollider,
} from '../engine/collider';
import { Node } from '../engine/core/Node';

describe('collider components', () => {
  test('dispatches enter stay and exit callbacks', () => {
    const events: string[] = [];
    const root = new Node('root');
    root.addComponent(CollideSystem);

    const a = new Node('a');
    a.setPosition(0, 0);
    const aCollider = a.addComponent(BoxCollider, {
      width: 20,
      height: 20,
      onCollisionEnter: other => events.push(`enter:${other.tag}`),
      onCollisionStay: other => events.push(`stay:${other.tag}`),
      onCollisionExit: other => events.push(`exit:${other.tag}`),
    });

    const b = new Node('b');
    b.setPosition(10, 0);
    const bCollider = b.addComponent(BoxCollider, {
      tag: 7,
      width: 20,
      height: 20,
    });

    root.addChild(a);
    root.addChild(b);
    root._updateTree(1 / 60);
    root._updateTree(1 / 60);
    b.x = 100;
    root._updateTree(1 / 60);

    expect(aCollider.tag).toBe(0);
    expect(bCollider.tag).toBe(7);
    expect(events).toEqual(['enter:7', 'stay:7', 'exit:7']);
  });

  test('supports circle to polygon checks', () => {
    const root = new Node('root');
    root.addComponent(CollideSystem);

    const circle = new Node('circle');
    circle.setPosition(5, 5);
    let entered = false;
    circle.addComponent(CircleCollider, {
      radius: 4,
      onCollisionEnter: () => {
        entered = true;
      },
    });

    const triangle = new Node('triangle');
    triangle.addComponent(PolygonCollider, {
      points: [
        [0, 0],
        [20, 0],
        [0, 20],
      ],
    });

    root.addChild(circle);
    root.addChild(triangle);
    root._updateTree(1 / 60);

    expect(entered).toBe(true);
  });
});
