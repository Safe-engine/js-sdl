import { beforeEach, describe, expect, it } from 'bun:test'
import { TextureAsset, TextureAtlas } from '../engine/AssetManager'
import { BitmapFont } from '../engine/font/BitmapFont'
import { BitmapText } from '../engine/components/BitmapText'
import { Sprite } from '../engine/components/Sprite'
import { Node } from '../engine/core/Node'
import { Scene } from '../engine/core/Scene'
import { globalCommandBuffer } from '../engine/render/RenderCommandBuffer'

describe('BitmapFont & BitmapText', () => {
  let mockTexture: TextureAsset
  let atlas: TextureAtlas

  beforeEach(() => {
    mockTexture = new TextureAsset('atlas_tex', 50, 'atlas.png', 512, 512)
    atlas = new TextureAtlas(mockTexture, {
      'player.png': { x: 0, y: 0, width: 64, height: 64 },
      'enemy.png': { x: 64, y: 0, width: 64, height: 64 },
      'num_0': { x: 128, y: 0, width: 20, height: 30 },
      'num_1': { x: 148, y: 0, width: 14, height: 30 },
      'num_2': { x: 162, y: 0, width: 20, height: 30 },
      'char_A': { x: 182, y: 0, width: 24, height: 30 },
      'char_B': { x: 206, y: 0, width: 22, height: 30 },
    })
  })

  it('constructs BitmapFont from TextureAtlas frames', () => {
    const font = BitmapFont.fromAtlas(atlas, {
      face: 'ScoreFont',
      size: 30,
      lineHeight: 32,
    })

    expect(font.texture.id).toBe(50)
    expect(font.data.size).toBe(30)
    expect(font.data.lineHeight).toBe(32)

    const char0 = font.getChar('0')
    expect(char0).not.toBeNull()
    expect(char0?.x).toBe(128)
    expect(char0?.width).toBe(20)
    expect(char0?.height).toBe(30)
    expect(char0?.xadvance).toBe(20)

    const charA = font.getChar('A')
    expect(charA).not.toBeNull()
    expect(charA?.x).toBe(182)
    expect(charA?.width).toBe(24)

    const size = font.measureText('012', 30)
    expect(size.width).toBe(20 + 14 + 20)
    expect(size.height).toBe(32)
  })

  it('parses standard BMFont text format with kerning', () => {
    const fntText = `
info face="Futura" size=32 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1
common lineHeight=36 base=28 scaleW=256 scaleH=256 pages=1 packed=0
char id=65 x=10 y=20 width=20 height=25 xoffset=1 yoffset=3 xadvance=22 page=0
char id=86 x=35 y=20 width=22 height=25 xoffset=0 yoffset=3 xadvance=21 page=0
kerning first=65 second=86 amount=-3
`
    const font = BitmapFont.parseFnt(fntText, mockTexture)
    expect(font.data.face).toBe('Futura')
    expect(font.data.size).toBe(32)
    expect(font.data.lineHeight).toBe(36)

    const charA = font.getChar('A')
    expect(charA?.id).toBe(65)
    expect(charA?.x).toBe(10)
    expect(charA?.width).toBe(20)

    const kerning = font.getKerning(65, 86)
    expect(kerning).toBe(-3)

    // AV width with kerning: 22 + (-3) + 21 = 40
    const measured = font.measureText('AV', 32)
    expect(measured.width).toBe(40)
  })

  it('parses standard BMFont XML format', () => {
    const xml = `
<font>
  <info face="Comic" size="24"/>
  <common lineHeight="28" base="22"/>
  <chars count="2">
    <char id="48" x="0" y="0" width="16" height="22" xoffset="1" yoffset="2" xadvance="18"/>
    <char id="49" x="16" y="0" width="10" height="22" xoffset="2" yoffset="2" xadvance="14"/>
  </chars>
</font>
`
    const font = BitmapFont.parseFnt(xml, mockTexture)
    expect(font.data.face).toBe('Comic')
    expect(font.data.size).toBe(24)
    expect(font.data.lineHeight).toBe(28)

    const char0 = font.getChar(48)
    expect(char0?.width).toBe(16)
    expect(char0?.xadvance).toBe(18)
  })

  it('batches Sprite and BitmapText of the same TextureAtlas into a single draw call', async () => {
    // Setup mock WebGL context to verify batching
    const drawArraysCalls: Array<{ mode: number, first: number, count: number }> = []

    const mockGl = {
      TRIANGLES: 0x0004,
      FLOAT: 0x1406,
      UNSIGNED_BYTE: 0x1401,
      UNSIGNED_SHORT: 0x1403,
      ARRAY_BUFFER: 0x8892,
      DYNAMIC_DRAW: 0x88e8,
      TEXTURE_2D: 0x0de1,
      RGBA: 0x1908,
      createTexture: () => ({ id: 'mock-tex' }),
      bindTexture: () => {},
      createBuffer: () => ({ id: 'mock-vbo' }),
      bindBuffer: () => {},
      bufferData: () => {},
      bufferSubData: () => {},
      useProgram: () => {},
      enableVertexAttribArray: () => {},
      vertexAttribPointer: () => {},
      drawArrays: (mode: number, first: number, count: number) => {
        drawArraysCalls.push({ mode, first, count })
      },
      enable: () => {},
      disable: () => {},
      blendFunc: () => {},
      viewport: () => {},
      clearColor: () => {},
      clear: () => {},
      pixelStorei: () => {},
      texParameteri: () => {},
      texImage2D: () => {},
      texSubImage2D: () => {},
      getUniformLocation: () => 1,
      getAttribLocation: () => 1,
      createShader: () => 1,
      deleteShader: () => {},
      shaderSource: () => {},
      compileShader: () => {},
      getShaderParameter: () => true,
      createProgram: () => 1,
      attachShader: () => {},
      linkProgram: () => {},
      getProgramParameter: () => true,
      uniformMatrix3fv: () => {},
      uniform4f: () => {},
      uniform2f: () => {},
      uniform1f: () => {},
      uniform1i: () => {},
      scissor: () => {},
      flush: () => {},
      deleteTexture: () => {},
      activeTexture: () => {},
    }

    const mock2d = {
      font: '',
      fillStyle: '',
      textBaseline: '',
      measureText: (text: string) => ({ width: (text?.length ?? 0) * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }),
      fillText: () => {},
      strokeText: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8Array(4) }),
      putImageData: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
    }

    const mockCanvas = {
      getContext: (type: string) => {
        if (type === 'webgl2' || type === 'webgl') return mockGl
        if (type === '2d') return mock2d
        return null
      },
      width: 800,
      height: 600,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      setAttribute: () => {},
      id: 'sdl-canvas',
    }

    ;(globalThis as any).document = {
      title: '',
      getElementById: () => mockCanvas,
      createElement: () => mockCanvas,
      body: { appendChild: () => {} },
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
    ;(globalThis as any).Image = class {
      naturalWidth = 512
      naturalHeight = 512
      addEventListener() {}
    }

    const sdl3 = await import('../engine/sdl3')
    sdl3.createWindow('Test Window', 800, 600)

    const font = BitmapFont.fromAtlas(atlas, {
      face: 'BatchScoreFont',
      size: 30,
      lineHeight: 32,
    })

    const { AssetManager } = await import('../engine/AssetManager')
    ;(AssetManager as any).textures?.set('atlas_tex', {
      id: atlas.texture.id,
      width: 512,
      height: 512,
      refs: 1,
    })

    // Register atlas texture in sdl3
    ;(sdl3 as any).textures?.set(atlas.texture.id, {
      texture: mockGl.createTexture(),
      width: 512,
      height: 512,
      refs: 1,
      key: 'atlas_tex',
    })

    const scene = new Scene()
    scene.node.width = 800
    scene.node.height = 600

    // 1. Sprite from atlas
    const sprite1Node = new Node('sprite1')
    sprite1Node.x = 100
    sprite1Node.y = 100
    const sprite1 = sprite1Node.addComponent(Sprite)
    sprite1.setFrame(atlas, 'player.png')
    scene.node.addChild(sprite1Node)

    // 2. BitmapText from same atlas
    const textNode = new Node('scoreText')
    textNode.x = 200
    textNode.y = 100
    const textComp = textNode.addComponent(BitmapText, {
      font,
      text: '012',
      fontSize: 30,
    })
    scene.node.addChild(textNode)

    // 3. Sprite from same atlas
    const sprite2Node = new Node('sprite2')
    sprite2Node.x = 350
    sprite2Node.y = 100
    const sprite2 = sprite2Node.addComponent(Sprite)
    sprite2.setFrame(atlas, 'enemy.png')
    scene.node.addChild(sprite2Node)

    globalCommandBuffer.beginFrame()
    scene.render()

    // Submit commands to the WebGL batch renderer
    drawArraysCalls.length = 0
    globalCommandBuffer.submit()
    sdl3.present()

    // CRUCIAL ASSERTION:
    // 1 sprite (6 vertices) + 3 text glyphs (18 vertices) + 1 sprite (6 vertices) = 30 vertices
    // ALL drawn in EXACTLY 1 single draw call!
    expect(drawArraysCalls.length).toBe(1)
    expect(drawArraysCalls[0].count).toBe(30)
  })
})
