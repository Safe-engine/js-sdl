import { describe, expect, test } from 'bun:test'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'
import { Scene } from '../engine/core/Scene'

class TestComponent extends ComponentX {}

describe('Node transforms', () => {
  test('positions children inside the parent content rect', () => {
    const parent = new Node('parent')
    parent.width = 1126
    parent.height = 2436
    parent.x = 563
    parent.y = 1218

    const child = new Node('child')
    child.x = 496
    child.y = 1355
    parent.addChild(child)

    expect(child.worldX).toBe(496)
    expect(child.worldY).toBe(1355)
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
    child.x = 100
    child.y = 50
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
    child.x = 75
    child.y = 25
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
    child.x = 75
    child.y = 25
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
