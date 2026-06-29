import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

const sdlState = globalThis as typeof globalThis & {
  __jsSdlDrawCalls?: Array<{ id: number, x: number, y: number, width: number, height: number }>
  __jsSdlNextAssetId?: number
  __jsSdlTextureSizes?: Map<number, { width: number, height: number }>
}
const textureSizes = sdlState.__jsSdlTextureSizes ??= new Map()
const drawCalls = sdlState.__jsSdlDrawCalls ??= []

function nextAssetId(): number {
  const id = sdlState.__jsSdlNextAssetId ?? 1
  sdlState.__jsSdlNextAssetId = id + 1
  return id
}

mock.module('sdl3', () => ({
  drawTextureRegionRotated: () => {},
  drawTextureRotated: (
    id: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    drawCalls.push({ id, x, y, width, height })
  },
  drawTextureQuad: () => {},
  getTextureHeight: (id: number) => textureSizes.get(id)?.height ?? 0,
  getTextureWidth: (id: number) => textureSizes.get(id)?.width ?? 0,
  loadFont: () => nextAssetId(),
  loadTextFile: () => null,
  loadTextTexture: (_fontId: number, text: string) => {
    const id = nextAssetId()
    textureSizes.set(id, { width: text.length * 10, height: 20 })
    return id
  },
  loadTexture: () => {
    const id = nextAssetId()
    textureSizes.set(id, { width: 0, height: 0 })
    return id
  },
  releaseFont: () => {},
  releaseTexture: () => {},
}))

const { Sprite } = await import('../engine/components/Sprite')

describe('Sprite sizing', () => {
  test('renders nested sprites at their own natural size without parent size scaling', () => {
    const parent = new Node('parent')
    parent.x = 563
    parent.y = 1218
    const parentSprite = parent.addComponent(Sprite, { spriteFrame: 'Texture/Test/NestedIsland.png' })
    textureSizes.set(parentSprite.textureId, { width: 1278, height: 2443 })
    parentSprite.onRender()

    const child = new Node('child')
    child.x = 345
    child.y = 1992
    parent.addChild(child)
    const childSprite = child.addComponent(Sprite, { spriteFrame: 'Texture/Test/NestedBXH.png' })
    textureSizes.set(childSprite.textureId, { width: 244, height: 335 })

    drawCalls.length = 0
    childSprite.onRender()

    expect(child.width).toBe(244)
    expect(child.height).toBe(335)
    const lastDrawCall = drawCalls[drawCalls.length - 1]
    expect(lastDrawCall?.width).toBe(244)
    expect(lastDrawCall?.height).toBe(335)
    expect(lastDrawCall?.x).toBeCloseTo(147)
    expect(lastDrawCall?.y).toBeCloseTo(1821)
  })

  test('applies natural size after async texture dimensions become available', () => {
    const node = new Node('sprite')
    const sprite = node.addComponent(Sprite, { spriteFrame: 'Texture/Home/BXH.png' })

    sprite.onRender()
    expect(node.width).toBe(0)
    expect(node.height).toBe(0)

    textureSizes.set(sprite.textureId, { width: 244, height: 335 })
    sprite.onRender()

    expect(node.width).toBe(244)
    expect(node.height).toBe(335)
  })

  test('renders a nested sprite component at its own size without stealing parent auto size', () => {
    const parent = new Node('gem')
    const parentSprite = parent.addComponent(Sprite, { spriteFrame: 'Texture/Home/ic_gem_bg.png' })
    textureSizes.set(parentSprite.textureId, { width: 0, height: 0 })
    parent.width = 0
    parent.height = 0
    const childSprite = new Node('add').addComponent(Sprite, { spriteFrame: 'Texture/Home/button_add.png' })
    parent.resolveComponent(childSprite)

    textureSizes.set(childSprite.textureId, { width: 48, height: 48 })
    drawCalls.length = 0
    childSprite.onRender()

    expect(parent.width).toBe(0)
    expect(parent.height).toBe(0)
    let lastDrawCall = drawCalls[drawCalls.length - 1]
    expect(lastDrawCall?.width).toBe(48)
    expect(lastDrawCall?.height).toBe(48)

    textureSizes.set(parentSprite.textureId, { width: 312, height: 86 })
    parentSprite.onRender()

    expect(parent.width).toBe(312)
    expect(parent.height).toBe(86)

    textureSizes.set(childSprite.textureId, { width: 48, height: 48 })
    drawCalls.length = 0
    childSprite.onRender()
    lastDrawCall = drawCalls[drawCalls.length - 1]
    expect(lastDrawCall?.width).toBe(48)
    expect(lastDrawCall?.height).toBe(48)
  })

  test('corrects dimensions that were previously auto-applied', () => {
    const node = new Node('sprite')
    const sprite = node.addComponent(Sprite, { spriteFrame: 'Texture/Home/BXH.png' })

    textureSizes.set(sprite.textureId, { width: 1278, height: 2443 })
    sprite.onRender()
    expect(node.width).toBe(1278)
    expect(node.height).toBe(2443)

    textureSizes.set(sprite.textureId, { width: 244, height: 335 })
    sprite.onRender()

    expect(node.width).toBe(244)
    expect(node.height).toBe(335)
  })

  test('keeps explicitly sized sprites when texture dimensions change', () => {
    const node = new Node('sprite')
    node.width = 120
    node.height = 80
    const sprite = node.addComponent(Sprite, { spriteFrame: 'Texture/Home/BXH.png' })

    textureSizes.set(sprite.textureId, { width: 244, height: 335 })
    sprite.onRender()

    expect(node.width).toBe(120)
    expect(node.height).toBe(80)
  })
})
