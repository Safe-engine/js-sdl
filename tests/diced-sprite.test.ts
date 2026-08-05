import { describe, expect, it } from 'bun:test'
import { AssetManager } from '../engine/AssetManager'
import { DicedSprite, type DicedJSON } from '../engine/dicing/DicedSprite'
import { CMD_DRAW_MESH, globalCommandBuffer } from '../engine/render/RenderCommandBuffer'

const atlas: DicedJSON = {
  meta: {
    name: 'test', rawWidth: 32, rawHeight: 16,
    cellW: 16, cellH: 16, atlasCols: 2, atlasRows: 1,
    anchorX: 0.25, anchorY: 0.75,
  },
  animations: [{
    name: 'idle', fps: 10,
    frames: [[[0, 1]]],
  }],
}

type DicedSpriteInternals = {
  atlas: DicedJSON
  texture: { id: number, width: number, height: number }
  texturePath: string
  currentAnimation: { name: string }
  setCurrentAnimation(name: string): void
}

describe('DicedSprite', () => {
  it('sets the node anchor from atlas metadata', async () => {
    const sprite = new DicedSprite({ data: atlas, animation: 'idle' })
    const node = sprite.ensureNode()
    const internals = sprite as unknown as DicedSpriteInternals
    internals.texture = { id: 7, width: 32, height: 16 }
    internals.texturePath = 'test.png'

    await sprite.reload()

    expect(node.anchorX).toBe(0.25)
    expect(node.anchorY).toBe(0.75)
  })

  it('renders a multi-cell frame as one mesh command', () => {
    const sprite = new DicedSprite({ data: atlas, animation: 'idle' })
    sprite.ensureNode()
    const internals = sprite as unknown as DicedSpriteInternals
    internals.atlas = atlas
    internals.texture = { id: 7, width: 32, height: 16 }
    internals.texturePath = 'test.png'
    internals.setCurrentAnimation('idle')

    globalCommandBuffer.beginFrame()
    sprite.onRender()

    const view = globalCommandBuffer.getBufferView()
    expect(view.commands).toEqual(new Int32Array([CMD_DRAW_MESH]))
    expect(view.uintBuffer.slice(0, 4)).toEqual(new Uint32Array([7, 0xffffffff, 8, 12]))
    expect(view.shortBuffer).toEqual(new Uint16Array([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]))
  })

  it('switches loaded animations without reloading the texture', () => {
    const data: DicedJSON = {
      ...atlas,
      animations: [...atlas.animations, { name: 'alternate', fps: 10, frames: [[[1, 0]]] }],
    }
    const sprite = new DicedSprite({ data, animation: 'idle' })
    sprite.ensureNode()
    const internals = sprite as unknown as DicedSpriteInternals
    internals.atlas = data
    internals.texture = { id: 7, width: 32, height: 16 }
    internals.texturePath = 'test.png'
    internals.setCurrentAnimation('idle')

    sprite.setAnimation('alternate')

    expect(internals.currentAnimation.name).toBe('alternate')
    expect(internals.texturePath).toBe('test.png')
  })

  it('uses showFrame prop to set stop frame', async () => {
    const multiFrameAtlas: DicedJSON = {
      ...atlas,
      animations: [{ name: 'idle', fps: 10, frames: [[[0]], [[1]], [[0]]] }],
    }
    const sprite = new DicedSprite({ data: multiFrameAtlas, animation: 'idle', showFrame: 1 })
    sprite.ensureNode()

    const originalAcquireTexture = AssetManager.acquireTexture
    const fakeTexture = { id: 7, width: 32, height: 16 }
    AssetManager.acquireTexture = (() => fakeTexture) as any

    try {
      await sprite.reload()
      expect((sprite as any).stopFrame).toBe(1)
      expect((sprite as any).frameIndex).toBe(1)

      sprite.onUpdate(0.1)
      expect((sprite as any).frameIndex).toBe(1)
    } finally {
      AssetManager.acquireTexture = originalAcquireTexture
    }
  })
})
