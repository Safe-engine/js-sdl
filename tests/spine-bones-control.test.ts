import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

mock.module('sdl3', () => ({
  drawTextureMesh: () => {},
  drawTextureQuad: () => {},
  getTextureHeight: () => 0,
  getTextureWidth: () => 0,
  loadBinaryFile: () => null,
  loadTextFile: () => null,
  releaseTexture: () => {},
  submitCommandBuffer: () => {},
}))

const { SpineBonesControl } = await import('../engine/spine/SpineBonesControl')
const { SpineSkeleton } = await import('../engine/spine/SpineSkeleton')

describe('SpineBonesControl', () => {
  test('stops updating when a Spine callback disposes the skeleton', () => {
    const spine = new SpineSkeleton({ data: null as any })
    const apply = mock(() => {})
    const update = mock(() => {})
    const updateWorldTransform = mock(() => {})
    const skeleton = { update, updateWorldTransform } as any

    ;(spine as any).state = {
      update: () => {
        ;(spine as any).state = null
        spine.skeleton = null as any
      },
      apply,
    }
    spine.skeleton = skeleton

    spine.onUpdate(1 / 60)

    expect(apply).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(updateWorldTransform).not.toHaveBeenCalled()
  })

  test('waits for a loaded ancestor SpineSkeleton before applying bone positions', () => {
    const parent = new Node('spine')
    const spine = parent.addComponent(new SpineSkeleton({ data: null as any }))

    const child = new Node('control')
    const control = child.addComponent(new SpineBonesControl({
      bones: [['head', 12, 34], ['missing', 56, 78]],
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

  test('does not update a skeleton without an active animation track', () => {
    const spine = new SpineSkeleton({ data: null as any })
    let stateUpdates = 0
    let skeletonUpdates = 0
    ;(spine as any).state = {
      getCurrent: () => null,
      update: () => stateUpdates++,
    }
    spine.skeleton = {
      update: () => skeletonUpdates++,
    } as any

    spine.onUpdate(1 / 60)

    expect(stateUpdates).toBe(0)
    expect(skeletonUpdates).toBe(0)
  })
})
