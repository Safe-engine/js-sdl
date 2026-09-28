import { describe, expect, test } from 'bun:test'
import { Camera2D } from '../engine/components/Camera2D'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'
import { InputSystem } from '../engine/Input'
import { BoxCollider } from '../engine/collider'

class Lifecycle extends ComponentX {
  readonly log: string[] = []
  override onEnable(): void {
    this.log.push('enable')
  }

  override onDisable(): void {
    this.log.push('disable')
  }

  override onStart(): void {
    this.log.push('start')
  }

  override onUpdate(): void {
    this.log.push('update')
  }

  override onRender(): void {
    this.log.push('render')
  }

  override onDestroy(): void {
    this.log.push('destroy')
  }
}

function startedTree(): { root: Node, child: Node, component: Lifecycle } {
  const root = new Node('root')
  const child = root.addChild(new Node('child'))
  const component = child.addComponent(Lifecycle)
  root._startTree()
  return { root, child, component }
}

describe('ComponentX enabled state', () => {
  test('calls onEnable before onStart when the tree starts', () => {
    const { component } = startedTree()
    expect(component.log).toEqual(['enable', 'start'])
  })

  test('a disabled component is not updated or rendered', () => {
    const { root, component } = startedTree()
    component.log.length = 0

    component.enabled = false
    root._updateTree(0)
    root._renderTree()
    component.enabled = true
    root._updateTree(0)

    expect(component.log).toEqual(['disable', 'enable', 'update'])
  })

  test('setting enabled to its current value does not fire callbacks', () => {
    const { component } = startedTree()
    component.log.length = 0

    component.enabled = true
    component.enabled = false
    component.enabled = false

    expect(component.log).toEqual(['disable'])
  })

  test('deactivating an ancestor disables and reactivating enables descendants', () => {
    const { root, component } = startedTree()
    component.log.length = 0

    root.active = false
    root.active = false
    root.active = true

    expect(component.log).toEqual(['disable', 'enable'])
  })

  test('components under an inactive node wait for activation', () => {
    const root = new Node('root')
    root.active = false
    const component = root.addChild(new Node('child')).addComponent(Lifecycle)
    root._startTree()
    expect(component.log).toEqual(['start'])

    component.enabled = false
    component.enabled = true
    expect(component.log).toEqual(['start'])

    root.active = true
    expect(component.log).toEqual(['start', 'enable'])
  })

  test('components added to a started tree are enabled then started', () => {
    const { child } = startedTree()
    const added = child.addComponent(Lifecycle)
    expect(added.log).toEqual(['enable', 'start'])

    const later = child.addChild(new Node('later')).addComponent(Lifecycle)
    expect(later.log).toEqual(['enable', 'start'])
  })

  test('destroy disables an enabled component before destroying it', () => {
    const { child, component } = startedTree()
    component.log.length = 0

    child.destroy()

    expect(component.log).toEqual(['disable', 'destroy'])
  })

  test('disabled components do not receive input', () => {
    class Hit extends ComponentX {
      inputEnabled = true
      hits = 0
      override hitTest(): boolean {
        return true
      }

      override onPointerStart(): void {
        this.hits++
      }
    }
    const root = new Node('root')
    const hit = root.addComponent(Hit)
    const input = new InputSystem(root)

    hit.enabled = false
    input.dispatchStart(0, 0)
    hit.enabled = true
    input.dispatchStart(0, 0)

    expect(hit.hits).toBe(1)
  })

  test('Camera2D and colliders share the base enabled flag', () => {
    const camera = new Node('camera').addComponent(Camera2D, { enabled: false })
    expect(camera.enabled).toBe(false)
    const collider = new Node('collider').addComponent(BoxCollider, { width: 1, height: 1 })
    collider.enabled = false
    expect(collider.enabled).toBe(false)
  })
})

describe('Node.getComponentsInDescendants', () => {
  test('finds components at any depth, in tree order, excluding the node itself', () => {
    const root = new Node('root')
    root.addComponent(Lifecycle)
    const a = root.addChild(new Node('a'))
    const deep = a.addChild(new Node('deep'))
    const b = root.addChild(new Node('b'))
    const found = [deep.addComponent(Lifecycle), b.addComponent(Lifecycle)]
    const first = a.addComponent(Lifecycle)

    expect(root.getComponentsInDescendants(Lifecycle)).toEqual([first, ...found])
    expect(root.getComponentsInChildren(Lifecycle)).toEqual([first, found[1]])
  })
})
