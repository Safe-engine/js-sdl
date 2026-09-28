import { beforeAll, describe, expect, test } from 'bun:test'
import { TextureAsset, TextureAtlas } from '../engine/AssetManager'
import { BitmapText } from '../engine/components/BitmapText'
import { Sprite } from '../engine/components/Sprite'
import { BitmapFont } from '../engine/font/BitmapFont'
import { Node } from '../engine/core/Node'
import { CMD_DRAW_QUAD, CMD_DRAW_REGION, CMD_DRAW_SPRITE } from '../engine/render/RenderCommandBuffer'
import { spriteFrameCache } from '../engine/SpriteFrameCache'
import { installSdl3 } from './setup/sdl3'

interface Quad {
  corners: number[]
  uvs: number[]
}

const ops: number[] = []
const quads: Quad[] = []

beforeAll(() => {
  installSdl3({
    loadTexture: () => 1,
    // Texture 50 is the bitmap font page; everything else is the 64x32 sprite atlas.
    getTextureWidth: (id: number) => (id === 50 ? 512 : 64),
    getTextureHeight: (id: number) => (id === 50 ? 512 : 32),
    submitCommandBuffer: ({ commands, floatBuffer }: { commands: Int32Array, floatBuffer: Float32Array }) => {
      let floatIdx = 0
      for (const op of commands) {
        ops.push(op)
        if (op === CMD_DRAW_SPRITE) floatIdx += 9
        else if (op === CMD_DRAW_REGION) floatIdx += 13
        else if (op === CMD_DRAW_QUAD) {
          const values = [...floatBuffer.subarray(floatIdx, floatIdx + 16)]
          floatIdx += 16
          quads.push({
            corners: [0, 1, 4, 5, 8, 9, 12, 13].map(i => values[i]),
            uvs: [2, 3, 6, 7, 10, 11, 14, 15].map(i => values[i]),
          })
        }
      }
    },
  })
})

function render(parentScaleX: number, parentScaleY: number, configure: (sprite: Sprite) => void): Node {
  ops.length = 0
  quads.length = 0
  const parent = new Node('parent')
  parent.scaleX = parentScaleX
  parent.scaleY = parentScaleY
  parent.x = 100
  parent.y = 50
  const child = parent.addChild(new Node('child'))
  child.rotation = 45
  child.width = 20
  child.height = 10
  configure(child.addComponent(Sprite))
  parent._startTree()
  parent._renderTree()
  return child
}

/** Local rect corners (anchor 0.5) in quad order: TL, TR, BL, BR. */
function expectedCorners(node: Node): number[] {
  const m = node.renderMatrix
  return [[-10, -5], [10, -5], [-10, 5], [10, 5]].flatMap(([x, y]) => {
    const p = m.transformPoint(x, y)
    return [p.x, p.y]
  })
}

function expectCloseArray(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
}

describe('rendering under skewed transforms', () => {
  test('a rotated sprite under uniform scale keeps the sprite command', () => {
    render(2, 2, sprite => sprite.setTexture('skew.png'))
    expect(ops).toEqual([CMD_DRAW_SPRITE])
  })

  test('a rotated sprite under non-uniform parent scale is drawn as a skewed quad', () => {
    const child = render(2, 1, sprite => sprite.setTexture('skew.png'))

    expect(ops).toEqual([CMD_DRAW_QUAD])
    expectCloseArray(quads[0].corners, expectedCorners(child))
    expectCloseArray(quads[0].uvs, [0, 0, 1, 0, 0, 1, 1, 1])
  })

  test('rotated atlas frames keep their orientation when skewed', () => {
    // Stored rotated in the atlas: a 20x10 frame occupies 10x20 texels at (4, 2).
    spriteFrameCache.addFrame('skew-rotated', 'skew-atlas.png', {
      x: 4, y: 2, width: 20, height: 10, rotated: true,
    })
    const child = render(2, 1, sprite => {
      sprite.spriteFrame = 'skew-rotated'
    })

    expect(ops).toEqual([CMD_DRAW_QUAD])
    const quad = quads[0]
    // UVs follow the unrotated texel rect; corners are rotated to compensate.
    expectCloseArray(quad.uvs, [4 / 64, 2 / 32, 14 / 64, 2 / 32, 4 / 64, 22 / 32, 14 / 64, 22 / 32])
    const [tl, tr, bl, br] = [0, 1, 2, 3].map(i => [quad.corners[i * 2], quad.corners[i * 2 + 1]])
    const expected = expectedCorners(child)
    const at = (i: number) => [expected[i * 2], expected[i * 2 + 1]]
    // Same orientation as the unskewed -90 degree region path: the frame is
    // stored rotated clockwise, so texel TL shows at the display bottom-left.
    expectCloseArray(tl, at(2))
    expectCloseArray(tr, at(0))
    expectCloseArray(bl, at(3))
    expectCloseArray(br, at(1))
  })

  test('bitmap text glyphs are skewed with their node', () => {
    ops.length = 0
    quads.length = 0
    const texture = new TextureAsset('skew-font', 50, 'skew-font.png', 512, 512)
    const font = BitmapFont.fromAtlas(
      new TextureAtlas(texture, { num_0: { x: 128, y: 0, width: 20, height: 30 } }),
      { face: 'SkewFont', size: 30, lineHeight: 32 },
    )
    const parent = new Node('parent')
    parent.scaleX = 2
    const child = parent.addChild(new Node('text'))
    child.rotation = 30
    child.addComponent(BitmapText, { font, text: '0' })
    parent._startTree()
    parent._renderTree()

    expect(ops).toEqual([CMD_DRAW_QUAD])
    // Natural layout is 20x32 with anchor 0.5, so the glyph spans (-10,-16)..(10,14).
    const m = child.renderMatrix
    const expected = [[-10, -16], [10, -16], [-10, 14], [10, 14]].flatMap(([x, y]) => {
      const p = m.transformPoint(x, y)
      return [p.x, p.y]
    })
    expectCloseArray(quads[0].corners, expected)
    expectCloseArray(quads[0].uvs, [128 / 512, 0, 148 / 512, 0, 128 / 512, 30 / 512, 148 / 512, 30 / 512])
  })
})
