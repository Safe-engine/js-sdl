import { describe, expect, mock, test } from 'bun:test'

const sdlState = globalThis as typeof globalThis & {
  __jsSdlDrawCalls?: Array<{
    id: number
    x: number
    y: number
    width: number
    height: number
    r?: number
    g?: number
    b?: number
    a?: number
  }>
  __jsSdlNextAssetId?: number
  __jsSdlTextureSizes?: Map<number, { width: number, height: number }>
  __jsSdlFontSizes?: Map<number, number>
}
const textureSizes = sdlState.__jsSdlTextureSizes ??= new Map()
const fontSizes = sdlState.__jsSdlFontSizes ??= new Map()
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
    _angle: number,
    _centerX: number,
    _centerY: number,
    _flipX: boolean,
    _flipY: boolean,
    r: number,
    g: number,
    b: number,
    a: number,
  ) => {
    drawCalls.push({ id, x, y, width, height, r, g, b, a })
  },
  drawTextureQuad: () => {},
  getTextureHeight: (id: number) => textureSizes.get(id)?.height ?? 0,
  getTextureWidth: (id: number) => textureSizes.get(id)?.width ?? 0,
  loadFont: (_path: string, size: number) => {
    const id = nextAssetId()
    fontSizes.set(id, size)
    return id
  },
  loadTextFile: () => null,
  loadTextTexture: (fontId: number, text: string) => {
    const id = nextAssetId()
    const size = fontSizes.get(fontId) ?? 20
    textureSizes.set(id, { width: text.length * 10, height: size })
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

const { RichText } = await import('../engine/components/RichText')

describe('RichText', () => {
  test('renders Cocos-style color and size tags as separate tinted segments', () => {
    const richText = new RichText({
      font: 'font.ttf',
      string: 'A<color=#ff0000>R</color><size=30>B</size>',
      size: 20,
      lineHeight: 32,
    })
    richText.ensureNode('richText')
    richText.node.anchorX = 0
    richText.node.anchorY = 0

    drawCalls.length = 0
    richText.onRender()

    expect(drawCalls).toHaveLength(3)
    expect(drawCalls[0]).toMatchObject({ x: 0, y: 0, width: 10, height: 20 })
    expect(drawCalls[1]).toMatchObject({
      x: 10,
      y: 0,
      width: 10,
      height: 20,
      r: 255,
      g: 0,
      b: 0,
    })
    expect(drawCalls[2]).toMatchObject({ x: 20, y: 0, width: 10, height: 30 })
    expect(richText.node.width).toBe(30)
    expect(richText.node.height).toBe(30)
  })

  test('wraps rich text at maxWidth and uses lineHeight between lines', () => {
    const richText = new RichText({
      font: 'font.ttf',
      string: 'AB CD',
      size: 20,
      lineHeight: 28,
      maxWidth: 30,
    })
    richText.ensureNode('richText')
    richText.node.anchorX = 0
    richText.node.anchorY = 0

    drawCalls.length = 0
    richText.onRender()

    expect(drawCalls).toHaveLength(2)
    expect(drawCalls[0]).toMatchObject({ x: 0, y: 0, width: 30 })
    expect(drawCalls[1]).toMatchObject({ x: 5, y: 28, width: 20 })
    expect(richText.node.width).toBe(30)
    expect(richText.node.height).toBe(48)
  })

  test('draws outline before the styled text color', () => {
    const richText = new RichText({
      font: 'font.ttf',
      string: '<outline color=#0000ff width=1><color=#00ff00>Hi</color></outline>',
      size: 20,
    })
    richText.ensureNode('richText')
    richText.node.anchorX = 0
    richText.node.anchorY = 0

    drawCalls.length = 0
    richText.onRender()

    expect(drawCalls.length).toBeGreaterThan(1)
    expect(drawCalls[0]).toMatchObject({ r: 0, g: 0, b: 255 })
    expect(drawCalls[drawCalls.length - 1]).toMatchObject({ r: 0, g: 255, b: 0 })
  })
})
