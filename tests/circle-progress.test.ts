import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

const textureSizes = new Map<number, { width: number, height: number }>()
const quads: number[] = []
let nextTextureId = 1

mock.module('sdl3', () => ({
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
    const { commands, uintBuffer } = buf
    let cmdIdx = 0, uintIdx = 0
    while (cmdIdx < commands.length) {
      const op = commands[cmdIdx++]
      if (op === 0) break
      if (op === 2) {
        quads.push(uintBuffer[uintIdx++])
        uintIdx++
      }
    }
  },
}))

const { CircleProgress } = await import('../engine/components/CircleProgress')
const { Sprite } = await import('../engine/components/Sprite')

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
})
