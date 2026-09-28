import { describe, expect, test } from 'bun:test'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'

class Recorder extends ComponentX {
  static log: string[] = []
  override onUpdate(): void {
    Recorder.log.push(this.node.name)
  }

  override onRender(): void {
    Recorder.log.push(`render:${this.node.name}`)
  }
}

function makeTree(names: string[]): Node {
  const root = new Node('root')
  for (const name of names) {
    root.addChild(new Node(name)).addComponent(Recorder)
  }
  root._startTree()
  return root
}

describe('Node lifecycle', () => {
  test('destroying a node during update does not skip its next sibling', () => {
    class SelfDestroy extends ComponentX {
      override onUpdate(): void {
        this.node.destroy()
      }
    }
    Recorder.log = []
    const root = makeTree(['b', 'c'])
    root.addChild(new Node('a'), 0).addComponent(SelfDestroy)

    root._updateTree(0)

    expect(Recorder.log).toEqual(['b', 'c'])
    expect(root.children.map(child => child.name)).toEqual(['b', 'c'])
  })

  test('a node destroyed by an earlier sibling is not updated', () => {
    Recorder.log = []
    const root = makeTree(['b', 'c'])
    const b = root.children[0]
    class DestroyB extends ComponentX {
      override onUpdate(): void {
        b.destroy()
      }
    }
    root.addChild(new Node('a'), 0).addComponent(DestroyB)

    root._updateTree(0)

    expect(Recorder.log).toEqual(['c'])
  })

  test('children added during update start immediately and update next frame', () => {
    Recorder.log = []
    const root = makeTree(['a'])
    const started: string[] = []
    class Starter extends ComponentX {
      override onStart(): void {
        started.push(this.node.name)
      }
    }
    class Spawner extends ComponentX {
      override onUpdate(): void {
        const child = root.addChild(new Node('spawned'))
        child.addComponent(Recorder)
        child.addComponent(Starter)
        this.node.removeFromParent()
      }
    }
    root.addChild(new Node('spawner'), 0).addComponent(Spawner)

    root._updateTree(0)
    expect(started).toEqual(['spawned'])
    expect(Recorder.log).toEqual(['a'])

    Recorder.log = []
    root._updateTree(0)
    expect(Recorder.log).toEqual(['a', 'spawned'])
  })

  test('destroying a node during render does not skip its next sibling', () => {
    class DestroyOnRender extends ComponentX {
      override onRender(): void {
        this.node.destroy()
      }
    }
    Recorder.log = []
    const root = makeTree(['b', 'c'])
    root.addChild(new Node('a'), 0).addComponent(DestroyOnRender)

    root._renderTree()

    expect(Recorder.log).toEqual(['render:b', 'render:c'])
  })

  test('destroy is idempotent and invalidates the whole subtree', () => {
    let destroyed = 0
    class Counter extends ComponentX {
      override onDestroy(): void {
        destroyed++
      }
    }
    const parent = new Node('parent')
    const child = parent.addChild(new Node('child'))
    child.addComponent(Counter)

    expect(parent.isValid).toBe(true)
    parent.destroy()
    parent.destroy()
    child.destroy()

    expect(destroyed).toBe(1)
    expect(parent.isValid).toBe(false)
    expect(child.isValid).toBe(false)
  })

  test('a node that destroys itself stops updating its remaining components', () => {
    const log: string[] = []
    class First extends ComponentX {
      override onUpdate(): void {
        log.push('first')
        this.node.destroy()
      }
    }
    class Second extends ComponentX {
      override onUpdate(): void {
        log.push('second')
      }
    }
    const root = new Node('root')
    const node = root.addChild(new Node('node'))
    node.addComponent(First)
    node.addComponent(Second)
    root._startTree()

    root._updateTree(0)

    expect(log).toEqual(['first'])
  })
})
