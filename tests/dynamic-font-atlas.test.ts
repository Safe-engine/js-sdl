import { beforeEach, describe, expect, it } from 'bun:test'
import { dynamicFontAtlas, DynamicFontAtlas } from '../engine/font/DynamicFontAtlas'
import { Label } from '../engine/components/Label'
import { Node } from '../engine/core/Node'
import { Scene } from '../engine/core/Scene'
import { globalCommandBuffer } from '../engine/render/RenderCommandBuffer'

describe('DynamicFontAtlas', () => {
  let atlas: DynamicFontAtlas

  beforeEach(() => {
    atlas = new DynamicFontAtlas(512, 512, 1)
  })

  it('allocates glyphs using shelf bin-packing and caches them', () => {
    const glyph1 = atlas.getGlyph('Arial', 24, 'A')
    expect(glyph1).not.toBeNull()
    expect(glyph1.char).toBe('A')
    expect(glyph1.x).toBe(1)
    expect(glyph1.y).toBe(1)
    expect(glyph1.width).toBeGreaterThan(0)
    expect(glyph1.height).toBeGreaterThan(0)

    // Second call for same glyph must return the exact same cached object
    const glyph1Again = atlas.getGlyph('Arial', 24, 'A')
    expect(glyph1Again).toBe(glyph1)

    // Different glyph allocates next slot in the shelf
    const glyph2 = atlas.getGlyph('Arial', 24, 'B')
    expect(glyph2).not.toBeNull()
    expect(glyph2.char).toBe('B')
    expect(glyph2.x).toBe(glyph1.x + glyph1.width + 1)
    expect(glyph2.y).toBe(glyph1.y)
  })

  it('handles space characters without wasting texture space', () => {
    const spaceGlyph = atlas.getGlyph('Arial', 24, ' ')
    expect(spaceGlyph.char).toBe(' ')
    expect(spaceGlyph.width).toBe(0)
    expect(spaceGlyph.height).toBe(0)
    expect(spaceGlyph.xadvance).toBeGreaterThan(0)
  })

  it('measures single and multi-line text accurately', () => {
    const single = atlas.measureText('Arial', 20, 'Hello')
    expect(single.width).toBeGreaterThan(0)
    expect(single.height).toBe(Math.ceil(20 * 1.2))

    const multi = atlas.measureText('Arial', 20, 'Line 1\nLonger Line 2')
    expect(multi.width).toBeGreaterThan(single.width)
    expect(multi.height).toBe(Math.ceil(2 * 20 * 1.2))
  })

  it('batches multiple Labels of different text into a single draw call via DynamicFontAtlas', async () => {
    // ──────────────────────────────────────────────────────────────────────────
    // This test DOES NOT need the real WebGL pipeline.
    // Instead it inspects the raw command buffer after scene.render() and
    // verifies:
    //   1. Every CMD_DRAW_REGION command uses the SAME textureId (the shared
    //      dynamic atlas), meaning the GPU batcher would emit exactly 1 draw call.
    //   2. The total number of glyph regions is > 0.
    // ──────────────────────────────────────────────────────────────────────────

    const CMD_DRAW_REGION = 8
    const ADDITIVE_FLAG = 0x80000000

    const scene = new Scene()
    scene.node.width = 800
    scene.node.height = 600

    // 1. Label: Player title
    const label1Node = new Node('label1')
    label1Node.x = 100
    label1Node.y = 50
    label1Node.addComponent(Label, {
      string: 'Player 1',
      useDynamicAtlas: true,
      size: 24,
    })
    scene.node.addChild(label1Node)

    // 2. Label: Score
    const label2Node = new Node('label2')
    label2Node.x = 100
    label2Node.y = 120
    label2Node.addComponent(Label, {
      string: 'Score: 9999',
      useDynamicAtlas: true,
      size: 24,
    })
    scene.node.addChild(label2Node)

    // 3. Label: Status message
    const label3Node = new Node('label3')
    label3Node.x = 100
    label3Node.y = 200
    label3Node.addComponent(Label, {
      string: 'Game Over',
      useDynamicAtlas: true,
      size: 32,
    })
    scene.node.addChild(label3Node)

    // Render into the command buffer
    globalCommandBuffer.beginFrame()
    scene.render()

    // Inspect the buffer directly (no WebGL pipeline needed)
    const view = globalCommandBuffer.getBufferView()
    const atlasTexId = dynamicFontAtlas.getTextureId()

    const textureIds = new Set<number>()
    let regionCount = 0
    let cmdIdx = 0
    let uintIdx = 0
    let floatIdx = 0

    while (cmdIdx < view.commands.length) {
      const op = view.commands[cmdIdx++]
      if (op === 0) break

      if (op === CMD_DRAW_REGION) {
        const rawTexId = view.uintBuffer[uintIdx++]
        /*_color*/ uintIdx++
        // 13 floats: sx, sy, sw, sh, dx, dy, dw, dh, angle, cx, cy, flipX, flipY
        floatIdx += 13
        const pureTexId = (rawTexId & ~ADDITIVE_FLAG) >>> 0
        textureIds.add(pureTexId)
        regionCount++
      } else if (op === 1 /*CMD_DRAW_SPRITE*/) {
        uintIdx += 2
        floatIdx += 9
      } else if (op === 2 /*CMD_DRAW_QUAD*/) {
        uintIdx += 2
        floatIdx += 16
      } else if (op === 3 /*CMD_DRAW_MESH*/) {
        const vCount = view.uintBuffer[uintIdx + 2]
        const iCount = view.uintBuffer[uintIdx + 3]
        uintIdx += 4
        floatIdx += vCount * 2 + vCount * 2 + 6
      } else if (op === 4 /*CMD_DRAW_RECT*/) {
        uintIdx += 1
        floatIdx += 4
      } else if (op === 5 /*CMD_DRAW_LINE*/) {
        uintIdx += 1
        floatIdx += 4
      } else if (op === 6 /*CMD_PUSH_CLIP*/) {
        floatIdx += 4
      }
      // CMD_POP_CLIP (7) has no payload
    }

    // All labels must share the single dynamic atlas texture
    expect(regionCount).toBeGreaterThan(0)
    expect(textureIds.size).toBe(1)
    expect([...textureIds][0]).toBe(atlasTexId)

    // Clean up – let subsequent tests start fresh
    globalCommandBuffer.beginFrame()
  })
})

