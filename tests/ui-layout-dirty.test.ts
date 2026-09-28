import { describe, expect, test } from 'bun:test'
import { Node } from '../engine/core/Node'
import { installSdl3 } from './setup/sdl3'

installSdl3({
  drawRect: () => {},
  drawTextureRegionRotated: () => {},
  getTextureHeight: () => 0,
  getTextureWidth: () => 0,
  loadTexture: () => 1,
  releaseTexture: () => {},
})

const { LayoutChild, UIContainer, UILayout } = await import('../engine/components/UI')

class CountingContainer extends UIContainer {
  layoutPasses = 0

  override layoutChildren(): void {
    this.layoutPasses += 1
    super.layoutChildren()
  }
}

describe('UI layout dirtiness', () => {
  test('uses axis-specific spacing in horizontal, vertical, and grid layouts', () => {
    const layoutNode = new Node('layout')
    layoutNode.anchorX = 0
    layoutNode.anchorY = 0
    layoutNode.width = 100
    layoutNode.height = 100

    const layout = layoutNode.addComponent(UILayout, { direction: 'horizontal', spaceX: 10, spaceY: 20 })
    const first = new Node('first')
    first.anchorX = 0
    first.anchorY = 0
    first.width = 30
    const second = new Node('second')
    second.anchorX = 0
    second.anchorY = 0
    second.width = 30
    const third = new Node('third')
    third.anchorX = 0
    third.anchorY = 0
    const fourth = new Node('fourth')
    fourth.anchorX = 0
    fourth.anchorY = 0
    layoutNode.addChild(first)
    layoutNode.addChild(second)
    layoutNode.addChild(third)
    layoutNode.addChild(fourth)

    layout.layoutChildren()
    expect(second.x).toBe(40)

    layout.props.direction = 'vertical'
    layout.layoutChildren()
    expect(second.y).toBe(20)

    layout.props.direction = 'grid'
    layout.layoutChildren()
    expect(second.x).toBe(55)
    expect(second.y).toBe(0)
  })

  test('only re-lays out children when the child list changes', () => {
    const root = new Node('root')
    const containerNode = root.addChild(new Node('container'))
    containerNode.anchorX = 0
    containerNode.anchorY = 0
    containerNode.width = 200
    containerNode.height = 40
    const container = containerNode.addComponent(CountingContainer, { direction: 'horizontal' })
    containerNode.addChild(new Node('first'))

    root._updateTree(0)
    root._updateTree(0)
    expect(container.layoutPasses).toBe(1)

    containerNode.addChild(new Node('second'))
    root._updateTree(0)
    expect(container.layoutPasses).toBe(2)
  })

  test('re-lays out when a child size, flex, margin or the container changes', () => {
    const root = new Node('root')
    const containerNode = root.addChild(new Node('container'))
    containerNode.anchorX = 0
    containerNode.anchorY = 0
    containerNode.width = 200
    containerNode.height = 40
    const container = containerNode.addComponent(CountingContainer, { direction: 'horizontal' })
    const first = containerNode.addChild(new Node('first'))
    first.anchorX = 0
    first.anchorY = 0
    first.width = 50
    const second = containerNode.addChild(new Node('second'))
    second.anchorX = 0
    second.anchorY = 0
    second.width = 30
    const flexible = containerNode.addChild(new Node('flexible'))
    const flex = flexible.addComponent(LayoutChild)
    flex.flex = 1

    root._updateTree(0)
    expect(container.layoutPasses).toBe(1)
    expect(second.x).toBe(50)
    expect(flexible.width).toBe(120)

    // Flex resizing the child during layout must not count as a change.
    root._updateTree(0)
    expect(container.layoutPasses).toBe(1)

    first.width = 70
    root._updateTree(0)
    expect(container.layoutPasses).toBe(2)
    expect(second.x).toBe(70)
    expect(flexible.width).toBe(100)

    flex.margin = [0, 0, 0, 10]
    root._updateTree(0)
    expect(container.layoutPasses).toBe(3)
    expect(flexible.width).toBe(90)

    containerNode.width = 300
    root._updateTree(0)
    expect(container.layoutPasses).toBe(4)
    expect(flexible.width).toBe(190)

    container.align = 'end'
    root._updateTree(0)
    expect(container.layoutPasses).toBe(5)
  })
})
