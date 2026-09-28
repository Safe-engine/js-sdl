import { describe, expect, test } from 'bun:test'
import { Node } from '../engine/core/Node'
import { installSdl3 } from './setup/sdl3'

const textureSizes = new Map<number, { width: number, height: number }>()
const quads: number[] = []
/** First vertex (the wedge centre) of every quad submitted. */
const quadCenters: Array<{ x: number, y: number }> = []
let nextTextureId = 1

installSdl3({
  drawTextureQuad: (id: number) => quads.push(id),
  drawTextureRegionRotated: () => {},
  drawTextureRotated: () => {},
  getTextureHeight: (id: number) => textureSizes.get(id)?.height ?? 0,
  getTextureWidth: (id: number) => textureSizes.get(id)?.width ?? 0,
  loadTextFile: () => null,
  loadTexture: () => nextTextureId++,
  releaseTexture: () => {},
  submitCommandBuffer: (buf: any) => {
    if (!buf) return
    const { commands, uintBuffer, floatBuffer } = buf
    let cmdIdx = 0, uintIdx = 0, floatIdx = 0
    while (cmdIdx < commands.length) {
      const op = commands[cmdIdx++]
      if (op === 0) break
      if (op === 2) {
        quads.push(uintBuffer[uintIdx++])
        uintIdx++
        quadCenters.push({ x: floatBuffer[floatIdx], y: floatBuffer[floatIdx + 1] })
        floatIdx += 16
      }
    }
  },
})

const { CircleProgress } = await import('../engine/components/CircleProgress')
const { Sprite } = await import('../engine/components/Sprite')
const { Camera2D } = await import('../engine/components/Camera2D')
const { Scene } = await import('../engine/core/Scene')

describe('CircleProgress', () => {
  test('is a Sprite with clamped progress values', () => {
    const progress = new Node('progress').addComponent(CircleProgress, {
      spriteFrame: 'progress.png',
      min: 10,
      max: 30,
      value: 12,
    })

    expect(progress).toBeInstanceOf(Sprite)
    expect(progress.value).toBe(12)
    expect(progress.setValue(100).value).toBe(30)
    expect(progress.setValue(-100).value).toBe(10)
  })

  test('renders a sprite-texture wedge for the current value', () => {
    const node = new Node('progress')
    node.width = 40
    node.height = 40
    const progress = node.addComponent(CircleProgress, { spriteFrame: 'progress.png' })
    textureSizes.set(progress.textureId, { width: 40, height: 40 })

    progress.onRender()
    expect(quads).toHaveLength(0)

    progress.setValue(0.5).onRender()
    expect(quads.length).toBeGreaterThan(0)
    expect(quads.every(id => id === progress.textureId)).toBe(true)
  })

  test('draws through the active camera', () => {
    const scene = new Scene()
    scene.node.width = 800
    scene.node.height = 600
    const cameraNode = scene.node.addChild(new Node('camera'))
    cameraNode.x = 100
    cameraNode.y = 300
    cameraNode.addComponent(Camera2D)
    const node = scene.node.addChild(new Node('progress'))
    node.x = 100
    node.y = 300
    node.width = 40
    node.height = 40
    const progress = node.addComponent(CircleProgress, { spriteFrame: 'progress.png', value: 0.5 })
    textureSizes.set(progress.textureId, { width: 40, height: 40 })
    scene.node._startTree()
    quadCenters.length = 0

    scene.render()

    // The camera centres on the node, so the wedge centre lands mid-viewport.
    expect(quadCenters.length).toBeGreaterThan(0)
    expect(quadCenters[0]).toEqual({ x: 400, y: 300 })
  })
})
