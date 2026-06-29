import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

mock.module('sdl3', () => ({
  drawRect: () => {},
  drawTextureRegionRotated: () => {},
  getTextureHeight: () => 0,
  getTextureWidth: () => 0,
  loadTexture: () => 1,
  releaseTexture: () => {},
}))

const { UIContainer, UIElement } = await import('../engine/components/UI')

class CountingContainer extends UIContainer {
  layoutPasses = 0

  override layoutChildren(): void {
    this.layoutPasses += 1
    super.layoutChildren()
  }
}

describe('UI layout dirtiness', () => {
  test('skips redundant layout passes when nothing changed', () => {
    const root = new Node('root')
    const containerNode = new Node('container')
    containerNode.anchorX = 0
    containerNode.anchorY = 0
    root.addChild(containerNode)

    const container = containerNode.addComponent(CountingContainer)
    container.width = 200
    container.height = 40
    container.direction = 'horizontal'

    const childNode = new Node('child')
    containerNode.addChild(childNode)
    const child = childNode.addComponent(UIElement)
    child.width = 50
    child.height = 20

    root._updateTree(0)
    root._updateTree(0)

    expect(container.layoutPasses).toBe(1)

    child.flex = 1
    root._updateTree(0)

    expect(container.layoutPasses).toBe(2)
  })

  test('reapplies anchored child layout after parent size changes', () => {
    const root = new Node('root')
    const parentNode = new Node('parent')
    parentNode.anchorX = 0
    parentNode.anchorY = 0
    root.addChild(parentNode)

    const parent = parentNode.addComponent(UIElement)
    parent.width = 120
    parent.height = 60

    const childNode = new Node('child')
    childNode.anchorX = 0
    childNode.anchorY = 0
    parentNode.addChild(childNode)

    const child = childNode.addComponent(UIElement)
    child.setAnchors(0, 0, 1, 0)
    child.height = 10

    root._updateTree(0)

    expect(child.width).toBe(120)
    expect(child.layoutDirty).toBe(false)

    parent.width = 240
    root._updateTree(0)

    expect(child.width).toBe(240)
    expect(child.layoutDirty).toBe(false)
  })
})
