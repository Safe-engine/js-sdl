import { beforeAll, describe, expect, test } from 'bun:test'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'
import { Scene } from '../engine/core/Scene'
import { Tween } from '../engine/animation/Tween'
import { installSdl3 } from './setup/sdl3'

type Callback = (...args: any[]) => void
const hooks: Record<string, Callback> = {}
const capture = (name: string) => (callback: Callback) => {
  hooks[name] = callback
}

beforeAll(() => {
  installSdl3({
    onInit: capture('init'),
    onUpdate: capture('update'),
    onRender: capture('render'),
    onTouchStart: capture('touchStart'),
    onTouchMove: capture('touchMove'),
    onTouchEnd: capture('touchEnd'),
  })
})

// Fresh Engine singleton so other test files cannot leave a scene behind.
const { Engine } = await import('../engine/Engine?scene-test')

class LoggedScene extends Scene {
  readonly log: string[] = []
  override onLoad(): void {
    this.log.push('load')
  }

  override onEnter(): void {
    this.log.push('enter')
  }

  override onExit(): void {
    this.log.push('exit')
  }
}

describe('Engine scene switching', () => {
  test('starts the engine and activates the initial scene', async () => {
    const started = Engine.start('test', 100, 100)
    hooks.init()
    await started

    const first = new LoggedScene('first')
    Engine.scene = first

    expect(Engine.scene).toBe(first)
    expect(first.log).toEqual(['load', 'enter'])
  })

  test('switching scene during update defers until the next frame boundary', () => {
    const first = Engine.scene as LoggedScene
    const second = new LoggedScene('second')
    const updated: string[] = []
    class Switcher extends ComponentX {
      override onUpdate(): void {
        updated.push('switcher')
        Engine.scene = second
        // The old scene is still active and alive for the rest of this frame.
        expect(Engine.scene).toBe(first)
        expect(first.node.isValid).toBe(true)
        expect(second.log).toEqual([])
      }
    }
    class Sibling extends ComponentX {
      override onUpdate(): void {
        updated.push('sibling')
      }
    }
    first.node.addChild(new Node('switcher')).addComponent(Switcher)
    first.node.addChild(new Node('sibling')).addComponent(Sibling)

    hooks.update(1 / 60)

    expect(updated).toEqual(['switcher', 'sibling'])
    expect(Engine.scene).toBe(first)

    hooks.render()
    hooks.update(1 / 60)

    expect(Engine.scene).toBe(second)
    expect(first.log).toEqual(['load', 'enter', 'exit'])
    expect(first.node.isValid).toBe(false)
    expect(second.log).toEqual(['load', 'enter'])
  })

  test('switching scene from a touch handler defers until the next update', () => {
    const current = Engine.scene as LoggedScene
    const next = new LoggedScene('next')
    current.onTouchStart = () => {
      Engine.scene = next
    }

    hooks.touchStart(10, 10)
    expect(Engine.scene).toBe(current)

    hooks.update(1 / 60)
    expect(Engine.scene).toBe(next)
  })

  test('scene switches keep tweens owned by persistent nodes', () => {
    const persistent = Engine.addPersistentNode(new Node('hud'))
    const sceneNode = Engine.scene!.node.addChild(new Node('actor'))
    Tween.to(persistent, { x: 100 }, 1)
    Tween.to(sceneNode, { x: 100 }, 1)

    Engine.scene = new LoggedScene('after-tween')
    hooks.update(0.5)

    expect(persistent.x).toBe(50)
    expect(sceneNode.x).toBe(0)
  })
})
