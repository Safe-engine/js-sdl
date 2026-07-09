import { describe, expect, test } from 'bun:test'
import { ComponentX } from '../engine/core/ComponentX'
import { Container } from '../engine/core/Container'
import { instantiate } from '../engine/core/instantiate'
import { Node } from '../engine/core/Node'

const initLog: Array<number | undefined> = []

class InitRecorder extends ComponentX<{ value?: number }> {
  override init(data?: { value?: number }): void {
    super.init(data)
    initLog.push(data?.value)
  }
}

describe('instantiate', () => {
  test('initializes component instances exactly once', () => {
    initLog.length = 0
    const instance = instantiate(InitRecorder, { value: 7 })

    expect(initLog).toEqual([7])
    expect(instance.props.value).toBe(7)
  })

  test('auto-creates nodes only for renderable components', () => {
    class Renderable extends ComponentX {
      override onRender(): void {}
    }

    class Shared extends ComponentX {}

    const renderable = instantiate(Renderable)
    const shared = instantiate(Shared)

    expect(renderable.node).toBeInstanceOf(Node)
    expect(shared.node).toBeUndefined()
  })

  test('auto-creates a node for containers', () => {
    const container = instantiate(Container)

    expect(container.node).toBeInstanceOf(Node)
    expect(container.node.name).toBe('Container')
    expect(container.node.components).toEqual([container])
  })

  test('keeps shared components attachable with resolveComponent', () => {
    class Shared extends ComponentX {}

    const parent = new Node('parent')
    const shared = instantiate(Shared)

    parent.resolveComponent(shared)

    expect(parent.components).toContain(shared)
    expect(parent.children).toEqual([])
    expect(shared.node).toBe(parent)
  })

  test('creates a node when an unattached component adds a child component', () => {
    class Parent extends ComponentX {}
    class Child extends ComponentX {}

    const parent = instantiate(Parent)
    const child = parent.addComponent(Child)

    expect(parent.node).toBeInstanceOf(Node)
    expect(child.node).toBe(parent.node)
    expect(parent.node.components).toEqual([parent, child])
  })
})
