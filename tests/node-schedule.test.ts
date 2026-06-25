import { describe, expect, test } from 'bun:test'
import { Node } from '../engine/core/Node'

describe('Node scheduling', () => {
  test('runs scheduleOnce after its delay', () => {
    const node = new Node('timer')
    const log: number[] = []

    node.scheduleOnce((dt) => {
      log.push(dt)
    }, 0.5)

    node._updateTree(0.2)
    node._updateTree(0.2)
    expect(log).toEqual([])

    node._updateTree(0.2)
    expect(log).toEqual([0.2])

    node._updateTree(1)
    expect(log).toEqual([0.2])
  })

  test('runs scheduled callbacks at the requested interval and repeat count', () => {
    const node = new Node('timer')
    let calls = 0

    node.schedule(() => {
      calls += 1
    }, 0.5, 2)

    node._updateTree(0.4)
    expect(calls).toBe(0)

    node._updateTree(0.2)
    expect(calls).toBe(1)

    node._updateTree(0.5)
    expect(calls).toBe(2)

    node._updateTree(0.5)
    expect(calls).toBe(3)

    node._updateTree(1)
    expect(calls).toBe(3)
  })

  test('unschedule removes a specific callback', () => {
    const node = new Node('timer')
    let kept = 0
    let removed = 0

    const keepCallback = () => {
      kept += 1
    }
    const removeCallback = () => {
      removed += 1
    }

    node.schedule(keepCallback, 0)
    node.schedule(removeCallback, 0)
    node.unschedule(removeCallback)

    node._updateTree(0.16)

    expect(kept).toBe(1)
    expect(removed).toBe(0)
  })

  test('unscheduleAllCallbacks clears all pending callbacks', () => {
    const node = new Node('timer')
    let calls = 0

    node.schedule(() => {
      calls += 1
    }, 0)
    node.scheduleOnce(() => {
      calls += 1
    }, 1)

    node.unscheduleAllCallbacks()
    node._updateTree(2)

    expect(calls).toBe(0)
  })

  test('pauses scheduled callbacks while the node is inactive', () => {
    const node = new Node('timer')
    let calls = 0

    node.schedule(() => {
      calls += 1
    }, 0)

    node.active = false
    node._updateTree(1)
    expect(calls).toBe(0)

    node.active = true
    node._updateTree(0.16)
    expect(calls).toBe(1)
  })

  test('clears scheduled callbacks when the node is destroyed', () => {
    const node = new Node('timer')
    let calls = 0

    node.schedule(() => {
      calls += 1
    }, 0)

    node.destroy()
    node._updateTree(0.16)

    expect(calls).toBe(0)
  })
})
