import { describe, expect, test } from 'bun:test';
import { Node } from '../engine/core/Node';
import { Widget } from '../engine/components/Widget';
import { ActiveViewport } from '../engine/Viewport';

describe('Widget', () => {
  test('pins a node to the safe-area top-left border', () => {
    ActiveViewport.update([720, 1280, 720, 1280, 0, 0, 720, 1280, 0, 44, 720, 1202]);

    const node = new Node('hud');
    node.width = 120;
    node.height = 48;
    node.addComponent(Widget, { top: 16, left: 24 });

    node._updateTree(0);

    expect(node.x).toBe(84);
    expect(node.y).toBe(84);
    expect(node.width).toBe(120);
    expect(node.height).toBe(48);
  });

  test('pins a node to the safe-area bottom-right border', () => {
    ActiveViewport.update([720, 1280, 720, 1280, 0, 0, 720, 1280, 0, 44, 720, 1202]);

    const node = new Node('hud');
    node.width = 120;
    node.height = 48;
    node.addComponent(Widget, { right: 24, bottom: 16 });

    node._updateTree(0);

    expect(node.x).toBe(636);
    expect(node.y).toBe(1206);
  });

  test('stretches a node when opposite borders are supplied', () => {
    ActiveViewport.update([720, 1280, 720, 1280, 0, 0, 720, 1280, 10, 44, 700, 1202]);

    const node = new Node('hud');
    node.addComponent(Widget, { top: 8, right: 16, bottom: 24, left: 16 });

    node._updateTree(0);

    expect(node.width).toBe(668);
    expect(node.height).toBe(1170);
    expect(node.x).toBe(360);
    expect(node.y).toBe(637);
  });

  test('centers a node horizontally and vertically in the safe area', () => {
    ActiveViewport.update([720, 1280, 720, 1280, 0, 0, 720, 1280, 10, 44, 700, 1202]);

    const node = new Node('hud');
    node.width = 120;
    node.height = 48;
    node.anchorX = 0;
    node.anchorY = 1;
    node.addComponent(Widget, { centerVertical: true, centerHorizon: true });

    node._updateTree(0);

    expect(node.x).toBe(300);
    expect(node.y).toBe(669);
  });

  test('centers only the requested axis', () => {
    ActiveViewport.update([720, 1280, 720, 1280, 0, 0, 720, 1280, 10, 44, 700, 1202]);

    const node = new Node('hud');
    node.width = 120;
    node.height = 48;
    node.addComponent(Widget, { top: 16, centerHorizon: true });

    node._updateTree(0);

    expect(node.x).toBe(360);
    expect(node.y).toBe(84);
  });

  test('uses the full device window when inSafeArea is false', () => {
    ActiveViewport.update([720, 1280, 720, 1280, 0, 0, 720, 1280, 10, 44, 700, 1202]);

    const node = new Node('hud');
    node.width = 120;
    node.height = 48;
    node.addComponent(Widget, { right: 24, bottom: 16, inSafeArea: false });

    node._updateTree(0);

    expect(node.x).toBe(636);
    expect(node.y).toBe(1240);
  });
});
