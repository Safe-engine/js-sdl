import { describe, expect, it } from 'bun:test'
import {
  CMD_DRAW_LINE,
  CMD_DRAW_MESH,
  CMD_DRAW_QUAD,
  CMD_DRAW_RECT,
  CMD_DRAW_REGION,
  CMD_DRAW_SPRITE,
  CMD_POP_CLIP,
  CMD_PUSH_CLIP,
  RenderCommandBuffer,
} from '../engine/render/RenderCommandBuffer'
import { submitCommandBuffer } from '../engine/sdl3'

describe('RenderCommandBuffer', () => {
  it('should encode sprite regions and quads correctly into TypedArrays', () => {
    const buffer = new RenderCommandBuffer()
    buffer.beginFrame()

    buffer.pushSprite(10, 100, 200, 64, 64, 45, 32, 32, false, false, 255, 128, 64, 200)
    buffer.pushQuad(
      5,
      0, 0, 0, 0,
      10, 0, 1, 0,
      0, 10, 0, 1,
      10, 10, 1, 1,
      255, 255, 255, 255,
    )

    const view = buffer.getBufferView()
    expect(view.commands.length).toBe(2)
    expect(view.commands[0]).toBe(CMD_DRAW_SPRITE)
    expect(view.commands[1]).toBe(CMD_DRAW_QUAD)

    expect(view.uintBuffer[0]).toBe(10) // textureId
    expect(view.uintBuffer[2]).toBe(5)  // quad textureId
  })

  it('should encode mesh, rect, line and clip operations correctly', () => {
    const buffer = new RenderCommandBuffer()
    buffer.beginFrame()

    const positions = new Float32Array([0, 0, 10, 0, 0, 10])
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1])
    const indices = new Uint16Array([0, 1, 2])

    buffer.pushMesh(7, positions, uvs, indices, 255, 255, 255, 255, 0, 0, 1, 1, 1, 0)
    buffer.pushRect(10, 20, 30, 40, 255, 0, 0, 255)
    buffer.pushLine(0, 0, 100, 100, 0, 255, 0, 255)
    buffer.pushClipRect(5, 5, 50, 50)
    buffer.popClipRect()

    const view = buffer.getBufferView()
    expect(view.commands.length).toBe(5)
    expect(view.commands[0]).toBe(CMD_DRAW_MESH)
    expect(view.commands[1]).toBe(CMD_DRAW_RECT)
    expect(view.commands[2]).toBe(CMD_DRAW_LINE)
    expect(view.commands[3]).toBe(CMD_PUSH_CLIP)
    expect(view.commands[4]).toBe(CMD_POP_CLIP)
  })

  it('should execute submitCommandBuffer on Web fallback without errors', () => {
    const buffer = new RenderCommandBuffer()
    buffer.beginFrame()

    buffer.pushRect(0, 0, 100, 100, 255, 0, 0, 255)
    buffer.pushLine(0, 0, 50, 50, 0, 255, 0, 255)
    buffer.pushClipRect(10, 10, 80, 80)
    buffer.popClipRect()

    expect(() => submitCommandBuffer(buffer.getBufferView())).not.toThrow()
  })
})
