import { beforeAll, describe, expect, test } from 'bun:test'
import { Sprite } from '../engine/components/Sprite'
import { Node } from '../engine/core/Node'
import { CMD_DRAW_SPRITE } from '../engine/render/RenderCommandBuffer'
import { installSdl3 } from './setup/sdl3'

const alphas: number[] = []

beforeAll(() => {
  installSdl3({
    loadTexture: () => 1,
    getTextureWidth: () => 10,
    getTextureHeight: () => 10,
    submitCommandBuffer: ({ commands, uintBuffer }: { commands: Int32Array, uintBuffer: Uint32Array }) => {
      let uintIdx = 0
      for (const op of commands) {
        if (op !== CMD_DRAW_SPRITE) continue
        uintIdx++
        alphas.push(uintBuffer[uintIdx++] & 0xff)
      }
    },
  })
})

describe('opacity cascade', () => {
  test('worldOpacity multiplies ancestor opacities', () => {
    const root = new Node('root')
    const panel = root.addChild(new Node('panel'))
    const child = panel.addChild(new Node('child'))
    root.opacity = 0.5
    panel.opacity = 0.5
    child.opacity = 0.8

    expect(child.worldOpacity).toBeCloseTo(0.2)

    panel.removeFromParent()
    expect(child.worldOpacity).toBeCloseTo(0.4)
  })

  test('fading a parent fades the sprites underneath it', () => {
    alphas.length = 0
    const panel = new Node('panel')
    panel.opacity = 0.5
    const icon = panel.addChild(new Node('icon'))
    icon.addComponent(Sprite, { spriteFrame: 'icon.png' })
    panel._startTree()

    panel._renderTree()

    expect(alphas).toEqual([128])
  })
})
