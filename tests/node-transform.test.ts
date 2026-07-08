import { describe, expect, test } from 'bun:test'
import { Tween } from '../engine/animation/Tween'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'
import { Scene } from '../engine/core/Scene'

class TestComponent extends ComponentX {}

describe('Node transforms', () => {
  test('positions children relative to the parent transform origin', () => {
    const parent = new Node('parent')
    parent.width = 1126
    parent.height = 2436
    parent.x = 563
    parent.y = 1218

    const child = new Node('child')
    child.x = 496
    child.y = 1355
    parent.addChild(child)

    expect(child.worldX).toBe(1059)
    expect(child.worldY).toBe(2573)
  })

  test('scene roots keep scene coordinates in screen space', () => {
    const scene = new Scene()
    scene.node.width = 1126
    scene.node.height = 2436

    const child = new Node('child')
    child.x = 496
    child.y = 1355
    scene.node.addChild(child)

    expect(child.worldX).toBe(496)
    expect(child.worldY).toBe(1355)
  })

  test('rotates children around the parent anchor', () => {
    const parent = new Node('parent')
    parent.width = 100
    parent.height = 100
    parent.x = 50
    parent.y = 50
    parent.rotation = 90

    const child = new Node('child')
    child.x = 50
    child.y = 0
    parent.addChild(child)

    expect(child.worldX).toBeCloseTo(50)
    expect(child.worldY).toBeCloseTo(100)
  })

  test('scales child positions around the parent anchor', () => {
    const parent = new Node('parent')
    parent.width = 100
    parent.height = 100
    parent.x = 50
    parent.y = 50
    parent.scale = 2

    const child = new Node('child')
    child.x = 25
    child.y = -25
    parent.addChild(child)

    expect(child.worldX).toBe(100)
    expect(child.worldY).toBe(0)
  })

  test('converts content points with inherited scale', () => {
    const parent = new Node('parent')
    parent.width = 100
    parent.height = 100
    parent.x = 50
    parent.y = 50
    parent.scale = 2

    const child = new Node('child')
    child.width = 20
    child.height = 10
    child.x = 25
    child.y = -25
    child.scale = 0.5
    parent.addChild(child)

    expect(child.contentToWorld(20, 10)).toEqual({ x: 110, y: 5 })
  })

  test('converts local offsets from the node anchor', () => {
    const node = new Node('node')
    node.x = 50
    node.y = 50
    node.scale = 2

    expect(node.localToWorld(-10, 5)).toEqual({ x: 30, y: 60 })
  })

  test('exposes uniform scale for tweens', () => {
    Tween.stopAll()

    const node = new Node('node')
    Tween.to(node, { scale: 3 }, 1)

    Tween.update(0.5)
    expect(node.scale).toBe(2)
    expect(node.scaleX).toBe(2)
    expect(node.scaleY).toBe(2)

    Tween.update(0.5)
    expect(node.scale).toBe(3)
    expect(node.scaleX).toBe(3)
    expect(node.scaleY).toBe(3)

    Tween.stopAll()
  })

  test('converts world points into node space', () => {
    const parent = new Node('parent')
    parent.x = 20
    parent.y = -10
    parent.rotation = 90
    parent.scale = 2

    const child = new Node('child')
    child.x = 30
    child.y = 40
    child.rotation = -45
    child.scaleX = 0.5
    child.scaleY = 3
    parent.addChild(child)

    const worldPoint = child.localToWorld(12, -8)
    const localPoint = child.convertToNodeSpace(worldPoint)

    expect(localPoint.x).toBeCloseTo(12)
    expect(localPoint.y).toBeCloseTo(-8)
  })

  test('invalidates cached world transforms when an ancestor changes', () => {
    const parent = new Node('parent')
    parent.width = 100
    parent.height = 100
    parent.x = 50
    parent.y = 50

    const child = new Node('child')
    child.x = 50
    child.y = 0
    parent.addChild(child)

    expect(child.transformDirty).toBe(true)
    expect(child.worldX).toBe(100)
    expect(parent.transformDirty).toBe(false)
    expect(child.transformDirty).toBe(false)

    parent.rotation = 90

    expect(parent.transformDirty).toBe(true)
    expect(child.transformDirty).toBe(true)
    expect(child.worldX).toBeCloseTo(50)
    expect(child.worldY).toBeCloseTo(100)
    expect(parent.transformDirty).toBe(false)
    expect(child.transformDirty).toBe(false)
  })

  test('resolves explicitly positioned components as child nodes', () => {
    const parent = new Node('parent')
    const component = new TestComponent()
    component.ensureNode('child')

    parent.resolveComponent(component)

    expect(parent.children).toEqual([component.node])
    expect(parent.components).not.toContain(component)
  })

  test('resolves plain components onto the parent node', () => {
    const parent = new Node('parent')
    const component = new TestComponent()

    parent.resolveComponent(component)

    expect(parent.children).toEqual([])
    expect(parent.components).toContain(component)
    expect(component.node).toBe(parent)
  })
})
