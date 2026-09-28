import { describe, expect, test } from 'bun:test'
import { Camera2D } from '../engine/components/Camera2D'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'
import { Scene } from '../engine/core/Scene'
import type { InputEvent } from '../engine/Input'

/** Hit-tests a 20x20 box centred on its node, in world space. */
class Box extends ComponentX<{ log: string[], consume?: boolean }> {
  inputEnabled = true

  override hitTest(x: number, y: number): boolean {
    return Math.abs(x - this.node.worldX) <= 10 && Math.abs(y - this.node.worldY) <= 10
  }

  override onPointerStart(event: InputEvent): void {
    this.props.log.push(`${this.node.name}:start:${event.x},${event.y}`)
    if (this.props.consume) event.stopPropagation()
  }

  override onPointerMove(event: InputEvent): void {
    this.props.log.push(`${this.node.name}:move:${event.x},${event.y}:${event.getDeltaX()}`)
  }
}

function createScene(): Scene {
  const scene = new Scene()
  scene.node.width = 800
  scene.node.height = 600
  return scene
}

function addCamera(scene: Scene, x: number, y: number, props: ConstructorParameters<typeof Camera2D>[0] = {}): Camera2D {
  const node = scene.node.addChild(new Node('camera'))
  node.x = x
  node.y = y
  return node.addComponent(Camera2D, props)
}

function addBox(scene: Scene, name: string, x: number, y: number, log: string[], consume = false): Node {
  const node = scene.node.addChild(new Node(name))
  node.x = x
  node.y = y
  node.addComponent(Box, { log, consume })
  return node
}

describe('Camera-aware input', () => {
  test('hits nodes where the camera renders them, in world coordinates', () => {
    const scene = createScene()
    const log: string[] = []
    // Camera looks at (1000, 300): world x=1000 is drawn at screen x=400.
    addCamera(scene, 1000, 300)
    addBox(scene, 'box', 1000, 300, log)

    scene._dispatchTouchStart(1000, 300)
    scene._dispatchTouchEnd(1000, 300)
    expect(log).toEqual([])

    scene._dispatchTouchStart(400, 300)
    scene._dispatchTouchMove(410, 300)
    expect(log).toEqual(['box:start:1000,300', 'box:move:1010,300:10'])
  })

  test('respects zoom when converting touch coordinates', () => {
    const scene = createScene()
    const log: string[] = []
    addCamera(scene, 0, 0, { zoom: 2 })
    addBox(scene, 'box', 50, 0, log)

    // World (50, 0) is drawn at (400 + 50 * 2, 300).
    scene._dispatchTouchStart(500, 300)
    expect(log).toEqual(['box:start:50,0'])
  })

  test('skips nodes the camera does not render', () => {
    const scene = createScene()
    const log: string[] = []
    addCamera(scene, 400, 300, { mask: 0b01 })
    const hidden = addBox(scene, 'hidden', 400, 300, log)
    hidden.cameraMask = 0b10

    scene._dispatchTouchStart(400, 300)
    expect(log).toEqual([])
  })

  test('nodes drawn by a later camera are hit first', () => {
    const scene = createScene()
    const log: string[] = []
    // World camera scrolled far away; UI camera identity-like, rendered on top.
    addCamera(scene, 1400, 300, { mask: 0b01, priority: 0 })
    addCamera(scene, 400, 300, { mask: 0b10, priority: 1 })
    const ui = addBox(scene, 'ui', 400, 300, log, true)
    ui.cameraMask = 0b10
    const world = addBox(scene, 'world', 1400, 300, log, true)
    world.cameraMask = 0b01
    // Put the world box before the UI box in tree order to prove camera order wins.
    scene.node.addChild(world, 0)

    scene._dispatchTouchStart(400, 300)
    expect(log).toEqual(['ui:start:400,300'])
  })

  test('without cameras, touch coordinates are used as-is', () => {
    const scene = createScene()
    const log: string[] = []
    addBox(scene, 'box', 100, 100, log)

    scene._dispatchTouchStart(100, 100)
    expect(log).toEqual(['box:start:100,100'])
  })
})
