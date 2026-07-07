import { describe, expect, test } from 'bun:test'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'
import { NodePool } from '../engine/core/NodePool'

describe('NodePool', () => {
  test('stores detached nodes and returns them last-in first-out', () => {
    const parent = new Node('parent')
    const first = parent.addChild(new Node('first'))
    const second = parent.addChild(new Node('second'))
    const pool = new NodePool()

    pool.put(first)
    pool.put(second)

    expect(pool.size()).toBe(2)
    expect(first.parent).toBeNull()
    expect(second.parent).toBeNull()
    expect(parent.children).toEqual([])

    expect(pool.get()).toBe(second)
    expect(pool.get()).toBe(first)
    expect(pool.get()).toBeNull()
  })

  test('ignores duplicate puts', () => {
    const node = new Node('pooled')
    const pool = new NodePool()

    pool.put(node)
    pool.put(node)

    expect(pool.size()).toBe(1)
    expect(pool.get()).toBe(node)
    expect(pool.get()).toBeNull()
  })

  test('clears pooled nodes by destroying them', () => {
    const destroyed: string[] = []

    class DestroyRecorder extends ComponentX {
      constructor(private readonly id: string) {
        super()
      }

      override onDestroy(): void {
        destroyed.push(this.id)
      }
    }

    const first = new Node('first')
    const second = new Node('second')
    first.addComponent(new DestroyRecorder('first'))
    second.addComponent(new DestroyRecorder('second'))

    const pool = new NodePool()
    pool.put(first)
    pool.put(second)
    pool.clear()

    expect(pool.size()).toBe(0)
    expect(destroyed).toEqual(['first', 'second'])
    expect(first.components).toEqual([])
    expect(second.components).toEqual([])
  })
})
