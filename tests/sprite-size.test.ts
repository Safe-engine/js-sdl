import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

const sdlState = globalThis as typeof globalThis & {
  __jsSdlDrawCalls?: Array<{ id: number, x: number, y: number, width: number, height: number }>
  __jsSdlRegionDrawCalls?: Array<{
    id: number
    sourceX: number
    sourceY: number
    sourceWidth: number
    sourceHeight: number
    x: number
    y: number
    width: number
    height: number
    angle?: number
    centerX?: number
    centerY?: number
  }>
  __jsSdlNextAssetId?: number
  __jsSdlTextureSizes?: Map<number, { width: number, height: number }>
}
const textureSizes = sdlState.__jsSdlTextureSizes ??= new Map()
const drawCalls = sdlState.__jsSdlDrawCalls ??= []
const regionDrawCalls = sdlState.__jsSdlRegionDrawCalls ??= []

function nextAssetId(): number {
  const id = sdlState.__jsSdlNextAssetId ?? 1
  sdlState.__jsSdlNextAssetId = id + 1
  return id
}

mock.module('sdl3', () => ({
  drawTextureRegionRotated: (
    id: number,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
    centerX: number,
    centerY: number,
  ) => {
    regionDrawCalls.push({
      id,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height,
      angle,
      centerX,
      centerY,
    })
  },
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
const { ProgressBar } = await import('../engine/components/ProgressBar')
const { spriteFrameCache } = await import('../engine/SpriteFrameCache')

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
    expect(lastDrawCall?.x).toBeCloseTo(786)
    expect(lastDrawCall?.y).toBeCloseTo(3042.5)
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

  test('lets a ProgressBar component clamp Sprite rendering to fillRange', () => {
    const node = new Node('progress')
    const sprite = node.addComponent(Sprite, { spriteFrame: 'Texture/UI/progress.png' })
    textureSizes.set(sprite.textureId, { width: 100, height: 20 })
    node.addComponent(ProgressBar, { fillRange: 0.5 })

    regionDrawCalls.length = 0
    sprite.onRender()

    const lastDrawCall = regionDrawCalls[regionDrawCalls.length - 1]
    expect(lastDrawCall?.sourceWidth).toBe(50)
    expect(lastDrawCall?.sourceHeight).toBe(20)
    expect(lastDrawCall?.width).toBe(50)
    expect(lastDrawCall?.height).toBe(20)
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

  test('renders rotated atlas frames in their unrotated bounds', () => {
    spriteFrameCache.addFrame('rotated-block', 'Texture/blocks.png', {
      x: 10,
      y: 20,
      width: 30,
      height: 50,
      rotated: true,
    })
    const node = new Node('rotated')
    const sprite = node.addComponent(Sprite, { spriteFrame: 'rotated-block' })
    textureSizes.set(sprite.textureId, { width: 128, height: 128 })

    regionDrawCalls.length = 0
    sprite.onRender()

    expect(node.width).toBe(30)
    expect(node.height).toBe(50)
    const lastDrawCall = regionDrawCalls[regionDrawCalls.length - 1]
    expect(lastDrawCall?.sourceX).toBe(10)
    expect(lastDrawCall?.sourceY).toBe(20)
    expect(lastDrawCall?.sourceWidth).toBe(50)
    expect(lastDrawCall?.sourceHeight).toBe(30)
    expect(lastDrawCall?.x).toBe(-25)
    expect(lastDrawCall?.y).toBe(-15)
    expect(lastDrawCall?.width).toBe(50)
    expect(lastDrawCall?.height).toBe(30)
    expect(lastDrawCall?.angle).toBe(-90)
    expect(lastDrawCall?.centerX).toBe(25)
    expect(lastDrawCall?.centerY).toBe(15)
  })

  test('renders capInsets as 9-slice regions', () => {
    const node = new Node('sliced')
    node.width = 50
    node.height = 30
    const sprite = node.addComponent(Sprite, {
      spriteFrame: 'Texture/UI/panel.png',
      capInsets: [2, 3, 4, 5],
    })
    textureSizes.set(sprite.textureId, { width: 20, height: 10 })

    regionDrawCalls.length = 0
    sprite.onRender()

    expect(regionDrawCalls).toHaveLength(9)
    expect(regionDrawCalls.map(call => [
      call.sourceX,
      call.sourceY,
      call.sourceWidth,
      call.sourceHeight,
      call.x,
      call.y,
      call.width,
      call.height,
    ])).toEqual([
      [0, 0, 5, 2, -25, -15, 5, 2],
      [5, 0, 12, 2, -20, -15, 42, 2],
      [17, 0, 3, 2, 22, -15, 3, 2],
      [0, 2, 5, 4, -25, -13, 5, 24],
      [5, 2, 12, 4, -20, -13, 42, 24],
      [17, 2, 3, 4, 22, -13, 3, 24],
      [0, 6, 5, 4, -25, 11, 5, 4],
      [5, 6, 12, 4, -20, 11, 42, 4],
      [17, 6, 3, 4, 22, 11, 3, 4],
    ])
  })

  test('renders tiled sprites with clipped edge tiles', () => {
    const node = new Node('tiled')
    node.width = 25
    node.height = 18
    const sprite = node.addComponent(Sprite, {
      spriteFrame: 'Texture/UI/tile.png',
      tiled: true,
    })
    textureSizes.set(sprite.textureId, { width: 10, height: 8 })

    regionDrawCalls.length = 0
    sprite.onRender()

    expect(node.width).toBe(25)
    expect(node.height).toBe(18)
    expect(regionDrawCalls).toHaveLength(9)
    expect(regionDrawCalls.map(call => [call.sourceWidth, call.sourceHeight, call.width, call.height])).toEqual([
      [10, 8, 10, 8],
      [10, 8, 10, 8],
      [5, 8, 5, 8],
      [10, 8, 10, 8],
      [10, 8, 10, 8],
      [5, 8, 5, 8],
      [10, 2, 10, 2],
      [10, 2, 10, 2],
      [5, 2, 5, 2],
    ])
  })

  test('tiles cached sprite frames from their source region', () => {
    spriteFrameCache.addFrame('tile-frame', 'Texture/ui-atlas.png', {
      x: 12,
      y: 16,
      width: 6,
      height: 4,
    })
    const node = new Node('atlas-tiled')
    node.width = 14
    node.height = 4
    const sprite = node.addComponent(Sprite, {
      spriteFrame: 'tile-frame',
      tiled: true,
    })
    textureSizes.set(sprite.textureId, { width: 64, height: 64 })

    regionDrawCalls.length = 0
    sprite.onRender()

    expect(node.width).toBe(14)
    expect(node.height).toBe(4)
    expect(regionDrawCalls).toHaveLength(3)
    expect(regionDrawCalls.map(call => [
      call.sourceX,
      call.sourceY,
      call.sourceWidth,
      call.sourceHeight,
      call.width,
      call.height,
    ])).toEqual([
      [12, 16, 6, 4, 6, 4],
      [12, 16, 6, 4, 6, 4],
      [12, 16, 2, 4, 2, 4],
    ])
  })
})
