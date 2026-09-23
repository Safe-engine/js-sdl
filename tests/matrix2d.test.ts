import { describe, expect, test } from 'bun:test'
import { Matrix2D } from '../engine/math/Matrix2D'

describe('Matrix2D', () => {
  test('initializes as identity matrix by default', () => {
    const m = new Matrix2D()
    expect(m.a).toBe(1)
    expect(m.b).toBe(0)
    expect(m.c).toBe(0)
    expect(m.d).toBe(1)
    expect(m.tx).toBe(0)
    expect(m.ty).toBe(0)
  })

  test('constructs affine transform from translation, rotation, and scale', () => {
    const m = new Matrix2D().fromTransform(100, 200, 2, 3, 90)
    expect(m.tx).toBeCloseTo(100)
    expect(m.ty).toBeCloseTo(200)

    // With 90 deg rotation:
    // cos(90) = 0, sin(90) = 1
    // a = cos * sx = 0, b = sin * sx = 2
    // c = -sin * sy = -3, d = cos * sy = 0
    expect(m.a).toBeCloseTo(0)
    expect(m.b).toBeCloseTo(2)
    expect(m.c).toBeCloseTo(-3)
    expect(m.d).toBeCloseTo(0)

    const decomposed = m.decompose()
    expect(decomposed.x).toBeCloseTo(100)
    expect(decomposed.y).toBeCloseTo(200)
    expect(decomposed.scaleX).toBeCloseTo(2)
    expect(decomposed.scaleY).toBeCloseTo(3)
    expect(decomposed.rotation).toBeCloseTo(90)
  })

  test('accounts for origin offset in fromTransform', () => {
    // Rotating around an origin offset:
    // e.g., width 100, height 100, anchor (0.5, 0.5) -> origin (50, 50)
    const m = new Matrix2D().fromTransform(100, 100, 1, 1, 90, 50, 50)

    // Point (50, 50) in local space should remain at (100, 100)
    const pt = m.transformPoint(50, 50)
    expect(pt.x).toBeCloseTo(100)
    expect(pt.y).toBeCloseTo(100)
  })

  test('multiplies matrices correctly (parent * child hierarchy)', () => {
    // Parent at (50, 50), rotated 90 deg
    const parent = new Matrix2D().fromTransform(50, 50, 1, 1, 90)
    // Child at (50, 0)
    const child = new Matrix2D().fromTransform(50, 0, 1, 1, 0)

    const world = new Matrix2D()
    parent.multiply(child, world)

    // Transforming (0, 0) of child should land at (50, 100)
    const worldPos = world.transformPoint(0, 0)
    expect(worldPos.x).toBeCloseTo(50)
    expect(worldPos.y).toBeCloseTo(100)
    expect(world.tx).toBeCloseTo(50)
    expect(world.ty).toBeCloseTo(100)
  })

  test('inverts matrix correctly (M * M^-1 = I)', () => {
    const m = new Matrix2D().fromTransform(120, 340, 1.5, 2.5, 45)
    const inv = new Matrix2D()
    m.invert(inv)

    const product = new Matrix2D()
    m.multiply(inv, product)

    expect(product.a).toBeCloseTo(1)
    expect(product.b).toBeCloseTo(0)
    expect(product.c).toBeCloseTo(0)
    expect(product.d).toBeCloseTo(1)
    expect(product.tx).toBeCloseTo(0)
    expect(product.ty).toBeCloseTo(0)

    // Transforming a point forward then backward returns original point
    const original = { x: 42, y: 77 }
    const transformed = m.transformPoint(original.x, original.y)
    const reverted = inv.transformPoint(transformed.x, transformed.y)

    expect(reverted.x).toBeCloseTo(original.x)
    expect(reverted.y).toBeCloseTo(original.y)
  })

  test('handles zero determinant gracefully in invert', () => {
    const singular = new Matrix2D(0, 0, 0, 0, 10, 20)
    singular.invert()
    expect(singular.a).toBe(1)
    expect(singular.d).toBe(1)
    expect(singular.tx).toBe(0)
    expect(singular.ty).toBe(0)
  })
})
