import { submitCommandBuffer, type SpriteBatchBuffer } from 'sdl3'

export const CMD_DRAW_SPRITE = 1
export const CMD_DRAW_QUAD = 2
export const CMD_DRAW_MESH = 3
export const CMD_DRAW_RECT = 4
export const CMD_DRAW_LINE = 5
export const CMD_PUSH_CLIP = 6
export const CMD_POP_CLIP = 7
export const CMD_DRAW_REGION = 8

export class RenderCommandBuffer {
  public commands: Int32Array
  public floatBuffer: Float32Array
  public uintBuffer: Uint32Array
  public shortBuffer: Uint16Array

  private cmdOffset = 0
  private floatOffset = 0
  private uintOffset = 0
  private shortOffset = 0

  constructor(
    initialCmdCap = 1024,
    initialFloatCap = 16384,
    initialUintCap = 2048,
    initialShortCap = 8192,
  ) {
    this.commands = new Int32Array(initialCmdCap)
    this.floatBuffer = new Float32Array(initialFloatCap)
    this.uintBuffer = new Uint32Array(initialUintCap)
    this.shortBuffer = new Uint16Array(initialShortCap)
  }

  public isFrameActive = false

  public beginFrame(): void {
    this.cmdOffset = 0
    this.floatOffset = 0
    this.uintOffset = 0
    this.shortOffset = 0
    this.isFrameActive = true
  }

  public pushRegion(
    textureId: number,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    angle: number,
    cx: number,
    cy: number,
    flipX: boolean,
    flipY: boolean,
    r = 255,
    g = 255,
    b = 255,
    a = 255,
  ): void {
    this.ensureCapacities(1, 13, 2, 0)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_REGION

    this.uintBuffer[this.uintOffset++] = textureId >>> 0
    this.uintBuffer[this.uintOffset++] = c

    this.floatBuffer[this.floatOffset++] = sx
    this.floatBuffer[this.floatOffset++] = sy
    this.floatBuffer[this.floatOffset++] = sw
    this.floatBuffer[this.floatOffset++] = sh
    this.floatBuffer[this.floatOffset++] = dx
    this.floatBuffer[this.floatOffset++] = dy
    this.floatBuffer[this.floatOffset++] = dw
    this.floatBuffer[this.floatOffset++] = dh
    this.floatBuffer[this.floatOffset++] = angle
    this.floatBuffer[this.floatOffset++] = cx
    this.floatBuffer[this.floatOffset++] = cy
    this.floatBuffer[this.floatOffset++] = flipX ? 1 : 0
    this.floatBuffer[this.floatOffset++] = flipY ? 1 : 0

    this.autoSubmitIfInactive()
  }

  public pushSprite(
    textureId: number,
    x: number,
    y: number,
    width: number,
    height: number,
    angle = 0,
    centerX = 0,
    centerY = 0,
    flipX = false,
    flipY = false,
    r = 255,
    g = 255,
    b = 255,
    a = 255,
  ): void {
    this.ensureCapacities(1, 9, 2, 0)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_SPRITE

    this.uintBuffer[this.uintOffset++] = textureId >>> 0
    this.uintBuffer[this.uintOffset++] = c

    this.floatBuffer[this.floatOffset++] = x
    this.floatBuffer[this.floatOffset++] = y
    this.floatBuffer[this.floatOffset++] = width
    this.floatBuffer[this.floatOffset++] = height
    this.floatBuffer[this.floatOffset++] = angle
    this.floatBuffer[this.floatOffset++] = centerX
    this.floatBuffer[this.floatOffset++] = centerY
    this.floatBuffer[this.floatOffset++] = flipX ? 1 : 0
    this.floatBuffer[this.floatOffset++] = flipY ? 1 : 0

    this.autoSubmitIfInactive()
  }

  public pushQuad(
    textureId: number,
    x0: number,
    y0: number,
    u0: number,
    v0: number,
    x1: number,
    y1: number,
    u1: number,
    v1: number,
    x2: number,
    y2: number,
    u2: number,
    v2: number,
    x3: number,
    y3: number,
    u3: number,
    v3: number,
    r = 255,
    g = 255,
    b = 255,
    a = 255,
  ): void {
    this.ensureCapacities(1, 16, 2, 0)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_QUAD

    this.uintBuffer[this.uintOffset++] = textureId >>> 0
    this.uintBuffer[this.uintOffset++] = c

    this.floatBuffer[this.floatOffset++] = x0
    this.floatBuffer[this.floatOffset++] = y0
    this.floatBuffer[this.floatOffset++] = u0
    this.floatBuffer[this.floatOffset++] = v0
    this.floatBuffer[this.floatOffset++] = x1
    this.floatBuffer[this.floatOffset++] = y1
    this.floatBuffer[this.floatOffset++] = u1
    this.floatBuffer[this.floatOffset++] = v1
    this.floatBuffer[this.floatOffset++] = x2
    this.floatBuffer[this.floatOffset++] = y2
    this.floatBuffer[this.floatOffset++] = u2
    this.floatBuffer[this.floatOffset++] = v2
    this.floatBuffer[this.floatOffset++] = x3
    this.floatBuffer[this.floatOffset++] = y3
    this.floatBuffer[this.floatOffset++] = u3
    this.floatBuffer[this.floatOffset++] = v3

    this.autoSubmitIfInactive()
  }

  public pushMesh(
    textureId: number,
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint16Array,
    r = 255,
    g = 255,
    b = 255,
    a = 255,
    tx = 0,
    ty = 0,
    sx = 1,
    sy = 1,
    cos = 1,
    sin = 0,
  ): void {
    const vCount = (positions.length / 2) | 0
    const iCount = indices.length
    if (vCount <= 0 || iCount <= 0) return

    this.ensureCapacities(1, vCount * 4 + 6, 4, iCount)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_MESH

    this.uintBuffer[this.uintOffset++] = textureId >>> 0
    this.uintBuffer[this.uintOffset++] = c
    this.uintBuffer[this.uintOffset++] = vCount >>> 0
    this.uintBuffer[this.uintOffset++] = iCount >>> 0

    this.floatBuffer.set(positions, this.floatOffset)
    this.floatOffset += positions.length

    this.floatBuffer.set(uvs, this.floatOffset)
    this.floatOffset += uvs.length

    this.floatBuffer[this.floatOffset++] = tx
    this.floatBuffer[this.floatOffset++] = ty
    this.floatBuffer[this.floatOffset++] = sx
    this.floatBuffer[this.floatOffset++] = sy
    this.floatBuffer[this.floatOffset++] = cos
    this.floatBuffer[this.floatOffset++] = sin

    this.shortBuffer.set(indices, this.shortOffset)
    this.shortOffset += iCount

    this.autoSubmitIfInactive()
  }

  public pushRect(
    x: number,
    y: number,
    width: number,
    height: number,
    r = 255,
    g = 255,
    b = 255,
    a = 255,
  ): void {
    this.ensureCapacities(1, 4, 1, 0)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_RECT

    this.uintBuffer[this.uintOffset++] = c

    this.floatBuffer[this.floatOffset++] = x
    this.floatBuffer[this.floatOffset++] = y
    this.floatBuffer[this.floatOffset++] = width
    this.floatBuffer[this.floatOffset++] = height

    this.autoSubmitIfInactive()
  }

  public pushLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r = 255,
    g = 255,
    b = 255,
    a = 255,
  ): void {
    this.ensureCapacities(1, 4, 1, 0)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_LINE

    this.uintBuffer[this.uintOffset++] = c

    this.floatBuffer[this.floatOffset++] = x1
    this.floatBuffer[this.floatOffset++] = y1
    this.floatBuffer[this.floatOffset++] = x2
    this.floatBuffer[this.floatOffset++] = y2

    this.autoSubmitIfInactive()
  }

  public pushPoint(
    x: number,
    y: number,
    r = 255,
    g = 255,
    b = 255,
    a = 255,
  ): void {
    this.pushRect(x - 1, y - 1, 2, 2, r, g, b, a)
  }

  public pushCircle(
    x: number,
    y: number,
    radius: number,
    r = 255,
    g = 255,
    b = 255,
    a = 255,
    fill = false,
  ): void {
    const segments = Math.max(12, Math.ceil(radius / 2))
    let previousX = x + radius
    let previousY = y
    for (let i = 1; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2
      const currentX = x + Math.cos(angle) * radius
      const currentY = y + Math.sin(angle) * radius
      this.pushLine(previousX, previousY, currentX, currentY, r, g, b, a)
      if (fill) this.pushLine(x, y, currentX, currentY, r, g, b, a * 0.35)
      previousX = currentX
      previousY = currentY
    }
  }

  public pushPolyline(
    points: readonly Point[],
    r = 255,
    g = 255,
    b = 255,
    a = 255,
    closed = false,
  ): void {
    for (let i = 1; i < points.length; i++) {
      this.pushLine(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, r, g, b, a)
    }
    if (closed && points.length > 1) {
      const first = points[0]
      const last = points[points.length - 1]
      this.pushLine(last.x, last.y, first.x, first.y, r, g, b, a)
    }
  }

  public pushClipRect(x: number, y: number, width: number, height: number): void {
    this.ensureCapacities(1, 4, 0, 0)
    this.commands[this.cmdOffset++] = CMD_PUSH_CLIP
    this.floatBuffer[this.floatOffset++] = x
    this.floatBuffer[this.floatOffset++] = y
    this.floatBuffer[this.floatOffset++] = width
    this.floatBuffer[this.floatOffset++] = height

    this.autoSubmitIfInactive()
  }

  public popClipRect(): void {
    this.ensureCapacities(1, 0, 0, 0)
    this.commands[this.cmdOffset++] = CMD_POP_CLIP

    this.autoSubmitIfInactive()
  }

  public getBufferView(): SpriteBatchBuffer {
    this.ensureCapacities(1, 0, 0, 0)
    this.commands[this.cmdOffset] = 0

    return {
      commands: this.commands.subarray(0, this.cmdOffset),
      floatBuffer: this.floatBuffer.subarray(0, this.floatOffset),
      uintBuffer: this.uintBuffer.subarray(0, this.uintOffset),
      shortBuffer: this.shortBuffer.subarray(0, this.shortOffset),
    }
  }

  public submit(): void {
    if (this.cmdOffset === 0) {
      this.isFrameActive = false
      return
    }
    const view = this.getBufferView()
    this.cmdOffset = 0
    this.floatOffset = 0
    this.uintOffset = 0
    this.shortOffset = 0
    this.isFrameActive = false
    submitCommandBuffer(view)
  }

  private autoSubmitIfInactive(): void {
    if (!this.isFrameActive) {
      this.submit()
    }
  }

  private packColor(r: number, g: number, b: number, a: number): number {
    const cr = Math.min(255, Math.max(0, Math.round(r))) & 0xff
    const cg = Math.min(255, Math.max(0, Math.round(g))) & 0xff
    const cb = Math.min(255, Math.max(0, Math.round(b))) & 0xff
    const ca = Math.min(255, Math.max(0, Math.round(a))) & 0xff
    return (((cr << 24) | (cg << 16) | (cb << 8) | ca) >>> 0)
  }

  private ensureCapacities(
    cmdAdd: number,
    floatAdd: number,
    uintAdd: number,
    shortAdd: number,
  ): void {
    if (this.cmdOffset + cmdAdd >= this.commands.length) {
      const next = new Int32Array(this.commands.length * 2)
      next.set(this.commands)
      this.commands = next
    }
    if (this.floatOffset + floatAdd >= this.floatBuffer.length) {
      const next = new Float32Array(Math.max(this.floatBuffer.length * 2, this.floatOffset + floatAdd + 1024))
      next.set(this.floatBuffer)
      this.floatBuffer = next
    }
    if (this.uintOffset + uintAdd >= this.uintBuffer.length) {
      const next = new Uint32Array(Math.max(this.uintBuffer.length * 2, this.uintOffset + uintAdd + 512))
      next.set(this.uintBuffer)
      this.uintBuffer = next
    }
    if (this.shortOffset + shortAdd >= this.shortBuffer.length) {
      const next = new Uint16Array(Math.max(this.shortBuffer.length * 2, this.shortOffset + shortAdd + 2048))
      next.set(this.shortBuffer)
      this.shortBuffer = next
    }
  }
}

export const globalCommandBuffer = new RenderCommandBuffer()
