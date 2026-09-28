import { afterEach, describe, expect, test } from 'bun:test'
import { Tween } from '../engine/animation/Tween'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'

afterEach(() => {
  Tween.stopAll()
})

describe('Tween ownership', () => {
  test('stops a tween when its target node is destroyed', () => {
    const node = new Node('target')
    let stopped = false
    Tween.to(node, { x: 100 }, 1, { onStop: () => { stopped = true } })

    Tween.update(0.25)
    node.destroy()
    Tween.update(0.25)

    expect(node.x).toBe(25)
    expect(stopped).toBe(true)
  })

  test('infers the owner from a component target', () => {
    class Holder extends ComponentX {
      value = 0
    }
    const holder = new Node('holder').addComponent(Holder)
    const tween = Tween.to(holder, { value: 10 }, 1)

    expect(tween.owner).toBe(holder.node)
  })

  test('uses an explicit owner for plain object targets', () => {
    const owner = new Node('owner')
    const state = { value: 0 }
    Tween.to(state, { value: 10 }, 1, { owner })

    owner.destroy()
    Tween.update(0.5)

    expect(state.value).toBe(0)
  })

  test('waits while the owner has paused actions', () => {
    const node = new Node('paused')
    Tween.to(node, { x: 100 }, 1)

    node.pauseAllActionsAndSchedule()
    Tween.update(0.5)
    expect(node.x).toBe(0)

    node.resumeAllActionsAndSchedule()
    Tween.update(0.5)
    expect(node.x).toBe(50)
  })

  test('stopAll keeps animations owned inside the excepted subtree', () => {
    const keepRoot = new Node('keep')
    const kept = keepRoot.addChild(new Node('kept'))
    const dropped = new Node('dropped')
    const unowned = { value: 0 }
    Tween.to(kept, { x: 100 }, 1)
    Tween.sequence().to(dropped, { x: 100 }, 1).start()
    Tween.to(unowned, { value: 100 }, 1)

    Tween.stopAll(keepRoot)
    Tween.update(0.5)

    expect(kept.x).toBe(50)
    expect(dropped.x).toBe(0)
    expect(unowned.value).toBe(0)
  })
})
