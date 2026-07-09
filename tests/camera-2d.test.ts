import { describe, expect, test } from 'bun:test'
import { Camera2D } from '../engine/components/Camera2D'
import { ComponentX } from '../engine/core/ComponentX'
import { instantiate } from '../engine/core/instantiate'
import { Node } from '../engine/core/Node'
import { Scene } from '../engine/core/Scene'

interface RenderEntry {
  id: string
  x: number
  y: number
  rotation: number
  scale: number
}

class RenderRecorder extends ComponentX<{ id: string, log: RenderEntry[] }> {
  onRender(): void {
    this.props.log.push({
      id: this.props.id,
      x: this.node.worldX,
      y: this.node.worldY,
      rotation: this.node.worldRotation,
      scale: this.node.worldScaleX,
    })
  }
}

describe('Camera2D', () => {
  test('can be instantiated with its own transform node', () => {
    const camera = instantiate(Camera2D)

    expect(camera.node).toBeInstanceOf(Node)
  })

  test('applies the inverse camera transform around the viewport center', () => {
    const scene = new Scene()
    scene.node.width = 800
    scene.node.height = 600

    const cameraNode = new Node('camera')
    cameraNode.x = 100
    cameraNode.y = 50
    cameraNode.rotation = 90
    cameraNode.addComponent(Camera2D, { zoom: 2 })
    scene.node.addChild(cameraNode)

    const log: RenderEntry[] = []
    const target = new Node('target')
    target.x = 150
    target.y = 50
    target.rotation = 120
    target.scale = 3
    target.addComponent(RenderRecorder, { id: 'target', log })
    scene.node.addChild(target)

    scene.render()

    expect(log).toEqual([{
      id: 'target',
      x: 400,
      y: 200,
      rotation: 30,
      scale: 6,
    }])
    expect(target.worldX).toBe(150)
    expect(target.worldY).toBe(50)
  })

  test('renders enabled cameras by priority and supports overlapping masks', () => {
    const scene = new Scene()
    scene.node.width = 100
    scene.node.height = 100
    const log: RenderEntry[] = []

    const firstCameraNode = new Node('first-camera')
    firstCameraNode.x = 50
    firstCameraNode.y = 50
    firstCameraNode.addComponent(Camera2D, { mask: 0b01, priority: 10 })
    scene.node.addChild(firstCameraNode)

    const secondCameraNode = new Node('second-camera')
    secondCameraNode.x = 40
    secondCameraNode.y = 50
    secondCameraNode.addComponent(Camera2D, { mask: 0b11, priority: -10 })
    scene.node.addChild(secondCameraNode)

    const world = new Node('world')
    world.x = 60
    world.y = 50
    world.cameraMask = 0b01
    world.addComponent(RenderRecorder, { id: 'world', log })
    scene.node.addChild(world)

    const overlay = new Node('overlay')
    overlay.cameraMask = 0b10
    overlay.addComponent(RenderRecorder, { id: 'overlay', log })
    world.addChild(overlay)

    scene.render()

    expect(log.map(entry => [entry.id, entry.x])).toEqual([
      ['world', 70],
      ['overlay', 70],
      ['world', 60],
    ])
  })

  test('keeps legacy rendering when no enabled camera exists', () => {
    const scene = new Scene()
    const log: RenderEntry[] = []
    const target = new Node('target')
    target.x = 25
    target.cameraMask = 0
    target.addComponent(RenderRecorder, { id: 'target', log })
    scene.node.addChild(target)

    const disabledCamera = new Node('camera')
    disabledCamera.addComponent(Camera2D, { enabled: false })
    scene.node.addChild(disabledCamera)

    scene.render()

    expect(log[0]?.x).toBe(25)
  })
})
