import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'
import { installSdl3 } from './setup/sdl3'

installSdl3({
  drawTextureMesh: () => {},
  drawTextureQuad: () => {},
  getTextureHeight: () => 0,
  getTextureWidth: () => 0,
  loadBinaryFile: () => null,
  loadTextFile: () => null,
  releaseTexture: () => {},
  submitCommandBuffer: () => {},
})

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

  test('applies bone positions to the SpineSkeleton on the same node', () => {
    const node = new Node('spine')
    const spine = node.addComponent(new SpineSkeleton({ data: null as any }))
    const control = node.addComponent(new SpineBonesControl({
      bones: [['head', 12, 34], ['missing', 56, 78]],
    }))

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
