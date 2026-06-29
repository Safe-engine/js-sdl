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

const { Label } = await import('../engine/components/Label')
const { Sprite } = await import('../engine/components/Sprite')

describe('Label sizing', () => {
  test('renders a shared-node label component at its own size without stealing parent auto size', () => {
    const parent = new Node('gem')
    parent.x = 904
    parent.y = 120
    const parentSprite = parent.addComponent(Sprite, { spriteFrame: 'Texture/Home/ic_gem_bg.png' })
    textureSizes.set(parentSprite.textureId, { width: 0, height: 0 })
    parent.width = 0
    parent.height = 0
    const label = new Label({
      font: 'font.ttf',
      string: 'Gem',
      size: 20,
    })

    parent.resolveComponent(label)
    label.onRender()

    expect(parent.width).toBe(0)
    expect(parent.height).toBe(0)
    let lastDrawCall = drawCalls[drawCalls.length - 1]
    expect(lastDrawCall?.width).toBe(30)
    expect(lastDrawCall?.height).toBe(20)

    textureSizes.set(parentSprite.textureId, { width: 312, height: 86 })
    parentSprite.onRender()

    expect(parent.width).toBe(312)
    expect(parent.height).toBe(86)

    drawCalls.length = 0
    label.onRender()
    lastDrawCall = drawCalls[drawCalls.length - 1]
    expect(lastDrawCall?.x).toBe(889)
    expect(lastDrawCall?.y).toBe(110)
    expect(lastDrawCall?.width).toBe(30)
    expect(lastDrawCall?.height).toBe(20)
  })

  test('centers an explicit child label when node props omit position', () => {
    const parent = new Node('gem')
    parent.x = 904
    parent.y = 2294
    const parentSprite = parent.addComponent(Sprite, { spriteFrame: 'Texture/Home/ic_gem_bg.png' })
    textureSizes.set(parentSprite.textureId, { width: 312, height: 86 })
    parentSprite.onRender()

    const label = new Label({
      font: 'font.ttf',
      string: '20',
      size: 48,
    })
    label.ensureNode('label')
    label.node.color = { r: 111, g: 74, b: 36, a: 255 }
    parent.resolveComponent(label)

    drawCalls.length = 0
    label.onRender()

    expect(parent.width).toBe(312)
    expect(parent.height).toBe(86)
    const lastDrawCall = drawCalls[drawCalls.length - 1]
    expect(lastDrawCall?.x).toBe(894)
    expect(lastDrawCall?.y).toBe(2284)
    expect(lastDrawCall?.width).toBe(20)
    expect(lastDrawCall?.height).toBe(20)
  })

  test('keeps explicit child label positions when node props include coordinates', () => {
    const parent = new Node('gem')
    parent.x = 904
    parent.y = 2294
    const parentSprite = parent.addComponent(Sprite, { spriteFrame: 'Texture/Home/ic_gem_bg.png' })
    textureSizes.set(parentSprite.textureId, { width: 312, height: 86 })
    parentSprite.onRender()

    const label = new Label({
      font: 'font.ttf',
      string: '20',
      size: 48,
    })
    label.ensureNode('label')
    label.node.x = 160
    label.node.y = 46
    parent.resolveComponent(label)

    drawCalls.length = 0
    label.onRender()

    const lastDrawCall = drawCalls[drawCalls.length - 1]
    expect(lastDrawCall?.x).toBe(898)
    expect(lastDrawCall?.y).toBe(2287)
    expect(lastDrawCall?.width).toBe(20)
    expect(lastDrawCall?.height).toBe(20)
  })
})
