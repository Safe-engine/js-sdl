import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

mock.module('sdl3', () => ({
  drawTextureQuad: () => {},
  getTextureHeight: () => 0,
  getTextureWidth: () => 0,
  loadBinaryFile: () => null,
  loadTextFile: () => null,
  releaseTexture: () => {},
}))

const { SpineBonesControl } = await import('../engine/spine/SpineBonesControl')
const { SpineSkeleton } = await import('../engine/spine/SpineSkeleton')

describe('SpineBonesControl', () => {
  test('waits for a loaded ancestor SpineSkeleton before applying bone positions', () => {
    const parent = new Node('spine')
    const spine = parent.addComponent(new SpineSkeleton({ data: null as any }))

    const child = new Node('control')
    const control = child.addComponent(new SpineBonesControl({
      bonesName: ['head', 'missing'],
      posList: [{ x: 12, y: 34 } as Vec2, { x: 56, y: 78 } as Vec2],
    }))
    parent.addChild(child)

    const head = { x: 0, y: 0 }
    let worldUpdates = 0
    spine.skeleton = {
      findBone: (name: string) => name === 'head' ? head : null,
      updateWorldTransform: () => {
        worldUpdates += 1
      },
    } as any

    control.onUpdate()

    expect(head).toEqual({ x: 12, y: 34 })
    expect(worldUpdates).toBe(1)
  })
})
