export interface Point2D {
  x: number
  y: number
}

export interface TransformData {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

/**
 * High-performance 2D affine transformation matrix:
 * [ a  c  tx ]
 * [ b  d  ty ]
 * [ 0  0  1  ]
 */
export class Matrix2D {
  a = 1
  b = 0
  c = 0
  d = 1
  tx = 0
  ty = 0

  constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) {
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.tx = tx
    this.ty = ty
  }

  identity(): this {
    this.a = 1
    this.b = 0
    this.c = 0
    this.d = 1
    this.tx = 0
    this.ty = 0
    return this
  }

  set(a: number, b: number, c: number, d: number, tx: number, ty: number): this {
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.tx = tx
    this.ty = ty
    return this
  }

  copy(other: Matrix2D): this {
    this.a = other.a
    this.b = other.b
    this.c = other.c
    this.d = other.d
    this.tx = other.tx
    this.ty = other.ty
    return this
  }

  clone(): Matrix2D {
    return new Matrix2D(this.a, this.b, this.c, this.d, this.tx, this.ty)
  }

  /**
   * Constructs an affine matrix from translation, scale, rotation (degrees), and optional origin anchor.
   */
  fromTransform(
    x: number,
    y: number,
    scaleX: number,
    scaleY: number,
    rotationDegrees: number,
    originX = 0,
    originY = 0,
  ): this {
    const rad = (rotationDegrees * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const a = cos * scaleX
    const b = sin * scaleX
    const c = -sin * scaleY
    const d = cos * scaleY

    let tx = x
    let ty = y
    if (originX !== 0 || originY !== 0) {
      tx -= originX * a + originY * c
      ty -= originX * b + originY * d
    }

    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.tx = tx
    this.ty = ty
    return this
  }

  /**
   * Multiplies this matrix by another (this * other).
   * In a scene hierarchy: parentMatrix.multiply(childMatrix, resultMatrix)
   * transforms child local coordinates into parent's parent/world space.
   */
  multiply(other: Matrix2D, out?: Matrix2D): Matrix2D {
    const target = out ?? this
    const a = this.a * other.a + this.c * other.b
    const b = this.b * other.a + this.d * other.b
    const c = this.a * other.c + this.c * other.d
    const d = this.b * other.c + this.d * other.d
    const tx = this.a * other.tx + this.c * other.ty + this.tx
    const ty = this.b * other.tx + this.d * other.ty + this.ty

    target.a = a
    target.b = b
    target.c = c
    target.d = d
    target.tx = tx
    target.ty = ty
    return target
  }

  /**
   * Premultiplies this matrix by another (other * this).
   */
  premultiply(other: Matrix2D, out?: Matrix2D): Matrix2D {
    return other.multiply(this, out)
  }

  /**
   * Inverts the matrix.
   */
  invert(out?: Matrix2D): Matrix2D {
    const target = out ?? this
    const det = this.a * this.d - this.b * this.c
    if (Math.abs(det) < 1e-15) {
      return target.identity()
    }
    const invDet = 1 / det
    const a = this.d * invDet
    const b = -this.b * invDet
    const c = -this.c * invDet
    const d = this.a * invDet
    const tx = (this.c * this.ty - this.d * this.tx) * invDet
    const ty = (this.b * this.tx - this.a * this.ty) * invDet

    target.a = a
    target.b = b
    target.c = c
    target.d = d
    target.tx = tx
    target.ty = ty
    return target
  }

  /**
   * Transforms a 2D point (x, y) by this matrix.
   */
  transformPoint(x: number, y: number, out?: Point2D): Point2D {
    const px = this.a * x + this.c * y + this.tx
    const py = this.b * x + this.d * y + this.ty
    if (out) {
      out.x = px
      out.y = py
      return out
    }
    return { x: px, y: py }
  }

  /**
   * Decomposes the matrix into translation, scale, and rotation (degrees).
   */
  decompose(out?: TransformData): TransformData {
    const target = out ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    target.x = this.tx
    target.y = this.ty
    target.scaleX = Math.hypot(this.a, this.b)
    const det = this.a * this.d - this.b * this.c
    target.scaleY = Math.hypot(this.c, this.d) * (det < 0 ? -1 : 1)
    target.rotation = (Math.atan2(this.b, this.a) * 180) / Math.PI
    return target
  }
}
