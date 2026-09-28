import { describe, expect, test } from 'bun:test'
import {
  BoxCollider,
  CircleCollider,
  Collider,
  CollideSystem,
  testCollision,
} from '../engine/collider'
import { Node } from '../engine/core/Node'

/** Deterministic PRNG so failures are reproducible. */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function pairKey(a: Collider, b: Collider): string {
  const [x, y] = [a.node.name, b.node.name].sort()
  return `${x}|${y}`
}

describe('CollideSystem broadphase', () => {
  test('reports exactly the same touching pairs as a brute-force check', () => {
    const rand = random(42)
    const root = new Node('root')
    root.addComponent(CollideSystem)
    const colliders: Collider[] = []
    for (let i = 0; i < 60; i++) {
      const node = root.addChild(new Node(`c${i}`))
      node.x = rand() * 400
      node.y = rand() * 400
      node.rotation = rand() * 360
      colliders.push(i % 2 === 0
        ? node.addComponent(BoxCollider, { width: 10 + rand() * 40, height: 10 + rand() * 40 })
        : node.addComponent(CircleCollider, { radius: 5 + rand() * 20 }))
    }

    const touching = new Set<string>()
    for (const collider of colliders) {
      collider.props.onCollisionEnter = (other) => {
        touching.add(pairKey(collider, other))
      }
      collider.props.onCollisionExit = (other) => {
        touching.delete(pairKey(collider, other))
      }
    }

    for (let frame = 0; frame < 30; frame++) {
      for (const collider of colliders) {
        collider.node.x += (rand() - 0.5) * 30
        collider.node.y += (rand() - 0.5) * 30
      }
      root._updateTree(1 / 60)

      const expected = new Set<string>()
      for (let i = 0; i < colliders.length; i++) {
        for (let j = i + 1; j < colliders.length; j++) {
          if (testCollision(colliders[i], colliders[j])) expected.add(pairKey(colliders[i], colliders[j]))
        }
      }
      expect([...touching].sort()).toEqual([...expected].sort())
    }
    expect(touching.size).toBeGreaterThan(0)
  })

  test('fires exit when a touching collider is removed from the tree', () => {
    const root = new Node('root')
    root.addComponent(CollideSystem)
    const events: string[] = []
    const a = root.addChild(new Node('a'))
    a.addComponent(BoxCollider, {
      width: 10,
      height: 10,
      onCollisionEnter: () => events.push('enter'),
      onCollisionExit: () => events.push('exit'),
    })
    const b = root.addChild(new Node('b'))
    b.addComponent(BoxCollider, { width: 10, height: 10 })

    root._updateTree(0)
    b.destroy()
    root._updateTree(0)

    expect(events).toEqual(['enter', 'exit'])
  })

  test('fires stay every frame while overlapping and exit once apart', () => {
    const root = new Node('root')
    root.addComponent(CollideSystem)
    const events: string[] = []
    const a = root.addChild(new Node('a'))
    a.addComponent(CircleCollider, {
      radius: 10,
      onCollisionEnter: () => events.push('enter'),
      onCollisionStay: () => events.push('stay'),
      onCollisionExit: () => events.push('exit'),
    })
    const b = root.addChild(new Node('b'))
    b.x = 5
    b.addComponent(CircleCollider, { radius: 10 })

    root._updateTree(0)
    root._updateTree(0)
    b.x = 500
    root._updateTree(0)
    root._updateTree(0)

    expect(events).toEqual(['enter', 'stay', 'exit'])
  })
})
