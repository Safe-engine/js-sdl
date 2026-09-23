import { describe, expect, it, beforeEach } from 'bun:test'

describe('WebGL Renderer Batching', async () => {
  let drawArraysCalls: Array<{ mode: number; first: number; count: number }> = []
  let bufferSubDataCalls: Array<{ target: number; offset: number; size: number }> = []
  let blendFuncCalls: Array<[number, number]> = []
  let boundTextures: any[] = []

  const mockGl: any = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    DYNAMIC_DRAW: 35048,
    FLOAT: 5126,
    UNSIGNED_BYTE: 5121,
    TRIANGLES: 4,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    RGBA: 6408,
    NEAREST: 9728,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    COLOR_BUFFER_BIT: 16384,
    BLEND: 3042,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 771,
    SCISSOR_TEST: 3089,

    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: () => {},

    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    useProgram: () => {},
    getAttribLocation: (_prog: any, name: string) => {
      if (name === 'a_position') return 0
      if (name === 'a_uv') return 1
      if (name === 'a_color') return 2
      return -1
    },
    getUniformLocation: () => ({}),
    uniform1i: () => {},
    uniform1f: () => {},
    uniform2f: () => {},
    uniform4f: () => {},

    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: (_target: number, offset: number, data: ArrayBufferView) => {
      bufferSubDataCalls.push({ target: _target, offset, size: data.byteLength })
    },
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},

    createTexture: () => {
      const tex = { id: Math.random() }
      return tex
    },
    bindTexture: (_target: number, texture: any) => {
      boundTextures.push(texture)
    },
    texParameteri: () => {},
    texImage2D: () => {},
    deleteTexture: () => {},
    activeTexture: () => {},

    enable: () => {},
    disable: () => {},
    blendFunc: (s: number, d: number) => {
      blendFuncCalls.push([s, d])
    },
    viewport: () => {},
    clearColor: () => {},
    clear: () => {},
    drawArrays: (mode: number, first: number, count: number) => {
      drawArraysCalls.push({ mode, first, count })
    },
    flush: () => {},
    scissor: () => {},
  }

  const mockCanvas: any = {
    getContext: (type: string) => (type === 'webgl' ? mockGl : null),
    width: 800,
    height: 600,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    id: 'sdl-canvas',
  }

  // Setup DOM global mocks for createWindow
  ;(globalThis as any).document = {
    title: '',
    getElementById: () => mockCanvas,
    createElement: () => mockCanvas,
    body: {
      appendChild: () => {},
    },
    addEventListener: () => {},
  }
  ;(globalThis as any).window = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;(globalThis as any).ResizeObserver = class {
    observe() {}
    disconnect() {}
  }
  ;(globalThis as any).screen = {
    orientation: { type: 'landscape-primary' },
  }

  const sdl3 = await import('../engine/sdl3')
  sdl3.createWindow('Test Window', 800, 600)

  beforeEach(() => {
    drawArraysCalls = []
    bufferSubDataCalls = []
    blendFuncCalls = []
    boundTextures = []
  })

  it('batches multiple sprites of the same texture with different colors into a single draw call', () => {
    // Register a test texture
    const texHandle = mockGl.createTexture()
    const texAsset = {
      texture: texHandle,
      width: 128,
      height: 128,
      refs: 1,
      key: 'test_tex',
    }

    // Directly access texture registration in sdl3 by loading or acquiring
    const texId = 100
    ;(sdl3 as any).textures?.set(texId, texAsset)

    // Draw 5 sprites with different colors and opacities
    sdl3.drawTextureRotated(texId, 0, 0, 64, 64, 0, 0, 0, false, false, 255, 0, 0, 255)
    sdl3.drawTextureRotated(texId, 70, 0, 64, 64, 0, 0, 0, false, false, 0, 255, 0, 128)
    sdl3.drawTextureRotated(texId, 140, 0, 64, 64, 0, 0, 0, false, false, 0, 0, 255, 200)
    sdl3.drawTextureRotated(texId, 210, 0, 64, 64, 0, 0, 0, false, false, 255, 255, 0, 50)
    sdl3.drawTextureRotated(texId, 280, 0, 64, 64, 0, 0, 0, false, false, 255, 255, 255, 255)

    // Present / flush
    sdl3.present()

    // Must be exactly 1 draw call for all 5 sprites (30 vertices)
    expect(drawArraysCalls.length).toBe(1)
    expect(drawArraysCalls[0].count).toBe(30) // 5 sprites * 6 vertices
    expect(bufferSubDataCalls.length).toBe(1)
    expect(bufferSubDataCalls[0].size).toBe(30 * 20) // 30 vertices * 20 bytes
  })

  it('splits batches when switching textures', () => {
    const tex1 = mockGl.createTexture()
    const tex2 = mockGl.createTexture()

    ;(sdl3 as any).textures?.set(101, { texture: tex1, width: 64, height: 64, refs: 1, key: 'tex1' })
    ;(sdl3 as any).textures?.set(102, { texture: tex2, width: 64, height: 64, refs: 1, key: 'tex2' })

    sdl3.drawTextureRotated(101, 0, 0, 64, 64, 0, 0, 0, false, false, 255, 255, 255, 255)
    sdl3.drawTextureRotated(102, 100, 0, 64, 64, 0, 0, 0, false, false, 255, 255, 255, 255)

    sdl3.present()

    expect(drawArraysCalls.length).toBe(2)
    expect(drawArraysCalls[0].count).toBe(6)
    expect(drawArraysCalls[1].count).toBe(6)
  })

  it('splits batches when switching blend mode (additive vs normal)', () => {
    const tex = mockGl.createTexture()
    ;(sdl3 as any).textures?.set(103, { texture: tex, width: 64, height: 64, refs: 1, key: 'tex3' })

    sdl3.drawTextureRotated(103, 0, 0, 64, 64, 0, 0, 0, false, false, 255, 255, 255, 255, false)
    sdl3.drawTextureRotated(103, 50, 0, 64, 64, 0, 0, 0, false, false, 255, 255, 255, 255, true) // additive

    sdl3.present()

    expect(drawArraysCalls.length).toBe(2)
  })

  it('batches primitive shapes (rect, line) with different colors into a single draw call', () => {
    sdl3.drawRect(10, 10, 50, 50, 255, 0, 0, 255)
    sdl3.drawRect(70, 10, 50, 50, 0, 255, 0, 128)
    sdl3.drawLine(0, 0, 100, 100, 0, 0, 255, 255)
    sdl3.drawPoint(50, 50, 255, 255, 0, 255)

    sdl3.present()

    // All primitives share whiteTexture and normal blend mode, so they must be in 1 draw call!
    expect(drawArraysCalls.length).toBe(1)
    expect(drawArraysCalls[0].count).toBe(24) // 4 items (3 quads + 1 point=rect) * 6 vertices = 24
  })

  it('correctly executes submitCommandBuffer through the batched pipeline', async () => {
    const { RenderCommandBuffer } = await import('../engine/render/RenderCommandBuffer')
    const buffer = new RenderCommandBuffer()
    buffer.beginFrame()

    buffer.pushRect(0, 0, 10, 10, 255, 0, 0, 255)
    buffer.pushRect(20, 20, 10, 10, 0, 255, 0, 255)
    buffer.pushLine(0, 0, 50, 50, 0, 0, 255, 255)

    sdl3.submitCommandBuffer(buffer.getBufferView())
    sdl3.present()

    expect(drawArraysCalls.length).toBe(1)
    expect(drawArraysCalls[0].count).toBe(18) // 3 primitives * 6 vertices
  })

  it('correctly handles pushSprite, pushRegion, pushQuad, and pushMesh in submitCommandBuffer', async () => {
    const { RenderCommandBuffer } = await import('../engine/render/RenderCommandBuffer')
    const buffer = new RenderCommandBuffer()
    buffer.beginFrame()

    const tex = mockGl.createTexture()
    sdl3.textures.set(200, { texture: tex, width: 100, height: 100, refs: 1, key: 'batch_test_tex' })

    // pushSprite
    buffer.pushSprite(200, 10, 20, 50, 50, 0, 0, 0, false, false, 255, 0, 0, 255)
    // pushRegion
    buffer.pushRegion(200, 0, 0, 50, 50, 60, 20, 50, 50, 0, 0, 0, false, false, 0, 255, 0, 255)
    // pushQuad
    buffer.pushQuad(200, 0, 0, 0, 0, 10, 0, 1, 0, 0, 10, 0, 1, 10, 10, 1, 1, 0, 0, 255, 255)
    // pushMesh (1 triangle = 3 vertices)
    const positions = new Float32Array([0, 0, 20, 0, 0, 20])
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1])
    const indices = new Uint16Array([0, 1, 2])
    buffer.pushMesh(200, positions, uvs, indices, 255, 255, 0, 255)

    sdl3.submitCommandBuffer(buffer.getBufferView())
    sdl3.present()

    // Since they all use texture 200 and normal blend mode, they MUST batch together!
    // 3 quads (18 vertices) + 1 mesh triangle (3 vertices) = 21 vertices
    expect(drawArraysCalls.length).toBe(1)
    expect(drawArraysCalls[0].count).toBe(21)
  })

  it('handles clip push and pop inside command buffer', async () => {
    const { RenderCommandBuffer } = await import('../engine/render/RenderCommandBuffer')
    const buffer = new RenderCommandBuffer()
    buffer.beginFrame()

    buffer.pushRect(0, 0, 100, 100)
    buffer.pushClipRect(10, 10, 50, 50)
    buffer.pushRect(10, 10, 20, 20)
    buffer.popClipRect()

    sdl3.submitCommandBuffer(buffer.getBufferView())
    sdl3.present()

    // Clipping forces batch flush so scissors can apply
    expect(drawArraysCalls.length).toBeGreaterThanOrEqual(2)
  })
})
