import { describe, expect, test } from 'bun:test'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'
import { InputSystem } from '../engine/Input'

class RenderRecorder extends ComponentX<{ id: string, log: string[] }> {
  onRender(): void {
    this.props.log.push(this.props.id)
  }
}

class HitRecorder extends ComponentX<{ id: string, log: string[] }> {
  inputEnabled = true

  hitTest(): boolean {
    return true
  }

  onPointerStart(): void {
    this.props.log.push(this.props.id)
  }
}

describe('Node zIndex', () => {
  test('renders siblings by ascending zIndex and preserves sibling order on ties', () => {
    const root = new Node('root')
    const log: string[] = []

    const middle = new Node('middle')
    middle.zIndex = 1
    middle.addComponent(RenderRecorder, { id: 'middle', log })

    const front = new Node('front')
    front.zIndex = 5
    front.addComponent(RenderRecorder, { id: 'front', log })

    const back = new Node('back')
    back.zIndex = -3
    back.addComponent(RenderRecorder, { id: 'back', log })

    const tied = new Node('tied')
    tied.zIndex = 1
    tied.addComponent(RenderRecorder, { id: 'tied', log })

    root.addChild(middle)
    root.addChild(front)
    root.addChild(back)
    root.addChild(tied)

    root._renderTree()

    expect(log).toEqual(['back', 'middle', 'tied', 'front'])
  })

  test('dispatches input to the visually topmost sibling first', () => {
    const root = new Node('root')
    const log: string[] = []
    const input = new InputSystem(root)

    const low = new Node('low')
    low.zIndex = 0
    low.addComponent(HitRecorder, { id: 'low', log })

    const high = new Node('high')
    high.zIndex = 10
    high.addComponent(HitRecorder, { id: 'high', log })

    root.addChild(low)
    root.addChild(high)

    input.dispatchStart(0, 0)

    expect(log).toEqual(['high', 'low'])
  })

  test('skips rendering invisible nodes and their descendants', () => {
    const root = new Node('root')
    const log: string[] = []

    const hidden = new Node('hidden')
    hidden.visible = false
    hidden.addComponent(RenderRecorder, { id: 'hidden', log })

    const child = new Node('child')
    child.addComponent(RenderRecorder, { id: 'child', log })
    hidden.addChild(child)

    root.addChild(hidden)
    root._renderTree()

    expect(log).toEqual([])
  })

  test('does not dispatch input to invisible nodes', () => {
    const root = new Node('root')
    const log: string[] = []
    const input = new InputSystem(root)

    const hidden = new Node('hidden')
    hidden.visible = false
    hidden.addComponent(HitRecorder, { id: 'hidden', log })

    const visible = new Node('visible')
    visible.addComponent(HitRecorder, { id: 'visible', log })

    root.addChild(hidden)
    root.addChild(visible)

    input.dispatchStart(0, 0)

    expect(log).toEqual(['visible'])
  })
})
