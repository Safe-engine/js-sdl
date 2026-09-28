import { describe, expect, test } from 'bun:test'
import { circleCircle, polygonCircle, polygonPolygon, rectIntersectsRect } from '../engine/helper/Intersection'

const square = (x: number, y: number, size: number): Vec2[] => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
]

describe('Intersection', () => {
  test('rectIntersectsRect treats touching edges as intersecting', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(rectIntersectsRect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(rectIntersectsRect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(true)
    expect(rectIntersectsRect(a, { x: 10.01, y: 0, width: 5, height: 5 })).toBe(false)
    expect(rectIntersectsRect(a, { x: 0, y: -20, width: 5, height: 5 })).toBe(false)
  })

  test('circleCircle compares centre distance with the summed radii', () => {
    expect(circleCircle({ x: 0, y: 0 }, 3, { x: 6, y: 0 }, 3)).toBe(true)
    expect(circleCircle({ x: 0, y: 0 }, 3, { x: 6.01, y: 0 }, 3)).toBe(false)
    expect(circleCircle({ x: 0, y: 0 }, 3, { x: 3, y: 4 }, 2)).toBe(true)
  })

  test('polygonCircle detects containment, edge overlap and separation', () => {
    const box = square(0, 0, 10)
    expect(polygonCircle(box, { x: 5, y: 5 }, 1)).toBe(true)
    expect(polygonCircle(box, { x: 12, y: 5 }, 2)).toBe(true)
    expect(polygonCircle(box, { x: 13, y: 13 }, 2)).toBe(false)
    // Near a corner the closest point is the vertex, not the edge's infinite line.
    expect(polygonCircle(box, { x: 12, y: 12 }, 2.9)).toBe(true)
    expect(polygonCircle(box, { x: 12, y: 12 }, 2.8)).toBe(false)
  })

  test('polygonPolygon uses separating axes on both polygons', () => {
    expect(polygonPolygon(square(0, 0, 10), square(5, 5, 10))).toBe(true)
    expect(polygonPolygon(square(0, 0, 10), square(11, 0, 10))).toBe(false)
    const diamond = (cx: number, cy: number): Vec2[] => [
      { x: cx, y: cy - 4 }, { x: cx + 4, y: cy }, { x: cx, y: cy + 4 }, { x: cx - 4, y: cy },
    ]
    // Bounding boxes overlap but the diamond's diagonal edge separates the shapes.
    expect(polygonPolygon(square(0, 0, 10), diamond(13, 13))).toBe(false)
    expect(polygonPolygon(square(0, 0, 10), diamond(11.5, 11.5))).toBe(true)
  })

  test('degenerate polygons never intersect', () => {
    const segment: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
    expect(polygonCircle(segment, { x: 5, y: 5 }, 5)).toBe(false)
    expect(polygonPolygon(segment, square(0, 0, 10))).toBe(false)
  })
})
