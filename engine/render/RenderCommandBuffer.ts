import { submitCommandBuffer, type SpriteBatchBuffer } from 'sdl3'
/** Any 2D affine matrix: `Matrix2D`, or plain objects such as DragonBones matrices. */
export interface AffineMatrix {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

export const CMD_DRAW_SPRITE = 1
export const CMD_DRAW_QUAD = 2
export const CMD_DRAW_MESH = 3
export const CMD_DRAW_RECT = 4
export const CMD_DRAW_LINE = 5
export const CMD_PUSH_CLIP = 6
export const CMD_POP_CLIP = 7
export const CMD_DRAW_REGION = 8
/** Mesh with a full affine transform (a, b, c, d, tx, ty); emitted only for skewed nodes. */
export const CMD_DRAW_MESH_AFFINE = 9

const ADDITIVE_TEXTURE_FLAG = 0x80000000
/** Relative tolerance below which a matrix's axes count as perpendicular. */
const SKEW_EPSILON = 1e-6

/**
 * Whether an affine matrix shears (its axes are not perpendicular), which the
 * decomposed x/y/w/h/angle draw commands cannot represent.
 */
export function matrixHasSkew(matrix: AffineMatrix): boolean {
  const b = matrix.b
  const c = matrix.c
  // Unrotated matrices (the common case) cannot shear.
  if (b === 0 && c === 0) return false
  const a = matrix.a
  const d = matrix.d
  const dot = a * c + b * d
  const det = a * d - b * c
  return (dot < 0 ? -dot : dot) > SKEW_EPSILON * (det < 0 ? -det : det)
}

/**
 * Rounds and clamps a colour channel to 0..255 (NaN becomes 0). Plain
 * comparisons instead of Math.min/max/round: this runs for every command and
 * native calls are costly in QuickJS.
 */
function clampByte(value: number): number {
  return value >= 255 ? 255 : value > 0 ? (value + 0.5) | 0 : 0
}

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
    additive = false,
  ): void {
    this.ensureCapacities(1, 13, 2, 0)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_REGION

    const uints = this.uintBuffer
    const u = this.uintOffset
    uints[u] = (textureId | (additive ? ADDITIVE_TEXTURE_FLAG : 0)) >>> 0
    uints[u + 1] = c
    this.uintOffset = u + 2

    const floats = this.floatBuffer
    const f = this.floatOffset
    floats[f] = sx
    floats[f + 1] = sy
    floats[f + 2] = sw
    floats[f + 3] = sh
    floats[f + 4] = dx
    floats[f + 5] = dy
    floats[f + 6] = dw
    floats[f + 7] = dh
    floats[f + 8] = angle
    floats[f + 9] = cx
    floats[f + 10] = cy
    floats[f + 11] = flipX ? 1 : 0
    floats[f + 12] = flipY ? 1 : 0
    this.floatOffset = f + 13

    if (!this.isFrameActive) this.submit()
  }

  /**
   * `pushRegion` for a node drawn with `matrix` (its render matrix), with the
   * destination in the usual decomposed form (rotation and scale taken from the
   * matrix, any pivot). Without skew this is exactly `pushRegion`; with skew
   * (non-uniform parent scale plus rotation) the rectangle is mapped back into
   * the node's local space and emitted as a quad through the full matrix.
   */
  public pushRegionTransformed(
    matrix: AffineMatrix,
    textureId: number,
    textureWidth: number,
    textureHeight: number,
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
    additive = false,
  ): void {
    if (!matrixHasSkew(matrix)) {
      this.pushRegion(textureId, sx, sy, sw, sh, dx, dy, dw, dh, angle, cx, cy, flipX, flipY, r, g, b, a, additive)
      return
    }
    const { a: ma, b: mb, c: mc, d: md } = matrix
    const scaleX = Math.hypot(ma, mb)
    const det = ma * md - mb * mc
    const scaleY = Math.hypot(mc, md) * (det < 0 ? -1 : 1)
    if (scaleX === 0 || scaleY === 0 || textureWidth <= 0 || textureHeight <= 0) return

    // Undo the decomposition (translate, rotate, scale) to find the pivot in
    // the node's local space.
    const nodeAngle = Math.atan2(mb, ma)
    const nodeCos = Math.cos(nodeAngle)
    const nodeSin = Math.sin(nodeAngle)
    const px = dx + cx - matrix.tx
    const py = dy + cy - matrix.ty
    const pivotX = (px * nodeCos + py * nodeSin) / scaleX
    const pivotY = (py * nodeCos - px * nodeSin) / scaleY
    // Rotation beyond the node's own (e.g. -90 for rotated atlas frames).
    const extra = angle * Math.PI / 180 - nodeAngle
    const cos = Math.cos(extra)
    const sin = Math.sin(extra)
    const corner = (u: number, v: number, out: number[], offset: number) => {
      // Offset from the pivot in the decomposed (rotated, scaled) space.
      const ox = u - cx
      const oy = v - cy
      const localX = pivotX + (ox * cos - oy * sin) / scaleX
      const localY = pivotY + (ox * sin + oy * cos) / scaleY
      out[offset] = ma * localX + mc * localY + matrix.tx
      out[offset + 1] = mb * localX + md * localY + matrix.ty
    }
    const p = this._quadCorners
    corner(0, 0, p, 0)
    corner(dw, 0, p, 2)
    corner(0, dh, p, 4)
    corner(dw, dh, p, 6)

    let u0 = sx / textureWidth
    let u1 = (sx + sw) / textureWidth
    let v0 = sy / textureHeight
    let v1 = (sy + sh) / textureHeight
    if (flipX) [u0, u1] = [u1, u0]
    if (flipY) [v0, v1] = [v1, v0]
    this.pushQuad(
      textureId,
      p[0], p[1], u0, v0,
      p[2], p[3], u1, v0,
      p[4], p[5], u0, v1,
      p[6], p[7], u1, v1,
      r, g, b, a,
      additive,
    )
  }

  private readonly _quadCorners = [0, 0, 0, 0, 0, 0, 0, 0]

  /** `pushSprite` counterpart of `pushRegionTransformed` (whole texture). */
  public pushSpriteTransformed(
    matrix: AffineMatrix,
    textureId: number,
    textureWidth: number,
    textureHeight: number,
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
    additive = false,
  ): void {
    if (!matrixHasSkew(matrix)) {
      this.pushSprite(textureId, x, y, width, height, angle, centerX, centerY, flipX, flipY, r, g, b, a, additive)
      return
    }
    this.pushRegionTransformed(
      matrix, textureId, textureWidth, textureHeight,
      0, 0, textureWidth, textureHeight,
      x, y, width, height, angle, centerX, centerY, flipX, flipY, r, g, b, a, additive,
    )
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
    additive = false,
  ): void {
    this.ensureCapacities(1, 9, 2, 0)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_SPRITE

    const uints = this.uintBuffer
    const u = this.uintOffset
    uints[u] = (textureId | (additive ? ADDITIVE_TEXTURE_FLAG : 0)) >>> 0
    uints[u + 1] = c
    this.uintOffset = u + 2

    // Locals instead of `this.floatBuffer[this.floatOffset++]`: fewer property
    // loads per store under QuickJS, which does not optimise them away.
    const floats = this.floatBuffer
    const f = this.floatOffset
    floats[f] = x
    floats[f + 1] = y
    floats[f + 2] = width
    floats[f + 3] = height
    floats[f + 4] = angle
    floats[f + 5] = centerX
    floats[f + 6] = centerY
    floats[f + 7] = flipX ? 1 : 0
    floats[f + 8] = flipY ? 1 : 0
    this.floatOffset = f + 9

    if (!this.isFrameActive) this.submit()
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
    additive = false,
  ): void {
    this.ensureCapacities(1, 16, 2, 0)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_QUAD

    const uints = this.uintBuffer
    const u = this.uintOffset
    uints[u] = (textureId | (additive ? ADDITIVE_TEXTURE_FLAG : 0)) >>> 0
    uints[u + 1] = c
    this.uintOffset = u + 2

    const floats = this.floatBuffer
    const f = this.floatOffset
    floats[f] = x0
    floats[f + 1] = y0
    floats[f + 2] = u0
    floats[f + 3] = v0
    floats[f + 4] = x1
    floats[f + 5] = y1
    floats[f + 6] = u1
    floats[f + 7] = v1
    floats[f + 8] = x2
    floats[f + 9] = y2
    floats[f + 10] = u2
    floats[f + 11] = v2
    floats[f + 12] = x3
    floats[f + 13] = y3
    floats[f + 14] = u3
    floats[f + 15] = v3
    this.floatOffset = f + 16

    if (!this.isFrameActive) this.submit()
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
    additive = false,
  ): void {
    const vCount = (positions.length / 2) | 0
    const iCount = indices.length
    if (vCount <= 0 || iCount <= 0) return

    this.ensureCapacities(1, vCount * 4 + 6, 4, iCount)
    const c = this.packColor(r, g, b, a)

    this.commands[this.cmdOffset++] = CMD_DRAW_MESH
    this.writeMeshHeader(textureId, additive, c, vCount, iCount)

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

    if (!this.isFrameActive) this.submit()
  }

  /**
   * `pushMesh` for a node drawn with `matrix` (its render matrix), taking the
   * same decomposed transform. Without skew this is exactly `pushMesh`; with
   * skew the translation is mapped back into the node's local space and the
   * mesh is emitted with the full affine matrix (CMD_DRAW_MESH_AFFINE).
   */
  public pushMeshTransformed(
    matrix: AffineMatrix,
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
    additive = false,
  ): void {
    if (!matrixHasSkew(matrix)) {
      this.pushMesh(textureId, positions, uvs, indices, r, g, b, a, tx, ty, sx, sy, cos, sin, additive)
      return
    }
    const vCount = (positions.length / 2) | 0
    const iCount = indices.length
    if (vCount <= 0 || iCount <= 0 || sx === 0 || sy === 0) return

    // The mesh origin in the node's local space: undo translate, rotate, scale.
    const ox = tx - matrix.tx
    const oy = ty - matrix.ty
    const localX = (ox * cos + oy * sin) / sx
    const localY = (oy * cos - ox * sin) / sy
    const { a: ma, b: mb, c: mc, d: md } = matrix

    this.ensureCapacities(1, vCount * 4 + 6, 4, iCount)
    const c = this.packColor(r, g, b, a)
    this.commands[this.cmdOffset++] = CMD_DRAW_MESH_AFFINE
    this.writeMeshHeader(textureId, additive, c, vCount, iCount)
    this.floatBuffer.set(positions, this.floatOffset)
    this.floatOffset += positions.length
    this.floatBuffer.set(uvs, this.floatOffset)
    this.floatOffset += uvs.length
    this.floatBuffer[this.floatOffset++] = ma
    this.floatBuffer[this.floatOffset++] = mb
    this.floatBuffer[this.floatOffset++] = mc
    this.floatBuffer[this.floatOffset++] = md
    this.floatBuffer[this.floatOffset++] = matrix.tx + ma * localX + mc * localY
    this.floatBuffer[this.floatOffset++] = matrix.ty + mb * localX + md * localY
    this.shortBuffer.set(indices, this.shortOffset)
    this.shortOffset += iCount

    if (!this.isFrameActive) this.submit()
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

    const floats = this.floatBuffer
    const f = this.floatOffset
    floats[f] = x
    floats[f + 1] = y
    floats[f + 2] = width
    floats[f + 3] = height
    this.floatOffset = f + 4

    if (!this.isFrameActive) this.submit()
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

    const floats = this.floatBuffer
    const f = this.floatOffset
    floats[f] = x1
    floats[f + 1] = y1
    floats[f + 2] = x2
    floats[f + 3] = y2
    this.floatOffset = f + 4

    if (!this.isFrameActive) this.submit()
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

    if (!this.isFrameActive) this.submit()
  }

  public popClipRect(): void {
    this.ensureCapacities(1, 0, 0, 0)
    this.commands[this.cmdOffset++] = CMD_POP_CLIP

    if (!this.isFrameActive) this.submit()
  }

  private _bufferView: SpriteBatchBuffer = {
    commands: new Int32Array(0),
    floatBuffer: new Float32Array(0),
    uintBuffer: new Uint32Array(0),
    shortBuffer: new Uint16Array(0),
  }

  public getBufferView(): SpriteBatchBuffer {
    this.ensureCapacities(1, 0, 0, 0)
    this.commands[this.cmdOffset] = 0

    this._bufferView.commands = this.commands.subarray(0, this.cmdOffset)
    this._bufferView.floatBuffer = this.floatBuffer.subarray(0, this.floatOffset)
    this._bufferView.uintBuffer = this.uintBuffer.subarray(0, this.uintOffset)
    this._bufferView.shortBuffer = this.shortBuffer.subarray(0, this.shortOffset)

    return this._bufferView
  }

  /** Submit queued commands and end the frame. */
  public submit(): void {
    this.isFrameActive = false
    this.flush()
  }

  /**
   * Submit queued commands without ending the frame, e.g. before an immediate
   * draw that must stay ordered after them. Later pushes keep batching.
   */
  public flush(): void {
    if (this.cmdOffset === 0) return
    const view = this.getBufferView()
    this.cmdOffset = 0
    this.floatOffset = 0
    this.uintOffset = 0
    this.shortOffset = 0
    submitCommandBuffer(view)
  }

  private writeMeshHeader(textureId: number, additive: boolean, color: number, vCount: number, iCount: number): void {
    this.uintBuffer[this.uintOffset++] = (textureId | (additive ? ADDITIVE_TEXTURE_FLAG : 0)) >>> 0
    this.uintBuffer[this.uintOffset++] = color
    this.uintBuffer[this.uintOffset++] = vCount >>> 0
    this.uintBuffer[this.uintOffset++] = iCount >>> 0
  }

  private packColor(r: number, g: number, b: number, a: number): number {
    // Opaque white is by far the most common tint.
    if (r === 255 && g === 255 && b === 255 && a === 255) return 0xffffffff
    return (((clampByte(r) << 24) | (clampByte(g) << 16) | (clampByte(b) << 8) | clampByte(a)) >>> 0)
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
