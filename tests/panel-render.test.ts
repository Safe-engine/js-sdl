import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

mock.module('sdl3', () => ({
  submitCommandBuffer: () => {},
}))

const { Panel } = await import('../engine/components/UI')
const { ComponentX } = await import('../engine/core/ComponentX')
const { globalCommandBuffer } = await import('../engine/render/RenderCommandBuffer')

class ChildRenderer extends ComponentX {
  onRender(): void {
    globalCommandBuffer.pushRect(30, 40, 5, 6)
  }
}

describe('Panel rendering', () => {
  test('uses world coordinates and renders before its children', () => {
    const root = new Node('root')
    const panelNode = new Node('panel')
    panelNode.x = 100
    panelNode.y = 200
    panelNode.width = 40
    panelNode.height = 20
    root.addChild(panelNode)
    panelNode.addComponent(Panel, { color: { r: 1, g: 2, b: 3, a: 128 } })

    const child = new Node('child')
    child.addComponent(ChildRenderer)
    panelNode.addChild(child)

    globalCommandBuffer.beginFrame()
    root._renderTree()

    expect(globalCommandBuffer.commands.slice(0, 2)).toEqual(new Int32Array([4, 4]))
    expect(globalCommandBuffer.floatBuffer.slice(0, 8)).toEqual(
      new Float32Array([80, 190, 40, 20, 30, 40, 5, 6]))
  })
})
