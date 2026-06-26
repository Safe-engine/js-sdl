import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

const textureSizes = new Map<number, { width: number, height: number }>()
const drawCalls: Array<{ id: number, x: number, y: number, width: number, height: number }> = []
let nextTextureId = 1

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
  loadTextFile: () => null,
  loadTexture: () => {
    const id = nextTextureId++
    textureSizes.set(id, { width: 0, height: 0 })
    return id
  },
  releaseTexture: () => {},
}))

const { Sprite } = await import('../engine/components/Sprite')

describe('Sprite sizing', () => {
  test('renders nested sprites at their own natural size without parent size scaling', () => {
    const parent = new Node('parent')
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
  })

  test('applies natural size after async texture dimensions become available', () => {
    const node = new Node('sprite')
    const sprite = node.addComponent(Sprite, { spriteFrame: 'Texture/Home/BXH.png' })

    sprite.onRender()
    expect(node.width).toBe(64)
    expect(node.height).toBe(64)

    textureSizes.set(sprite.textureId, { width: 244, height: 335 })
    sprite.onRender()

    expect(node.width).toBe(244)
    expect(node.height).toBe(335)
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
