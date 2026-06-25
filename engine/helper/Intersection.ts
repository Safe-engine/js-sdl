export function rectIntersectsRect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width
    && b.x <= a.x + a.width
    && a.y <= b.y + b.height
    && b.y <= a.y + a.height
}

export function circleCircle(
  a: Vec2,
  ar: number,
  b: Vec2,
  br: number,
): boolean {
  const radius = ar + br
  return distanceSquared(a, b) <= radius * radius
}

export function polygonCircle(
  polygon: Vec2[],
  circle: Vec2,
  radius: number,
): boolean {
  if (polygon.length < 3) return false
  if (pointInPolygon(circle, polygon)) return true

  const r2 = radius * radius
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (distancePointToSegmentSquared(circle, a, b) <= r2) return true
  }
  return false
}

export function polygonPolygon(a: Vec2[], b: Vec2[]): boolean {
  if (a.length < 3 || b.length < 3) return false
  return !hasSeparatingAxis(a, b) && !hasSeparatingAxis(b, a)
}

function hasSeparatingAxis(a: Vec2[], b: Vec2[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i]
    const p2 = a[(i + 1) % a.length]
    const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x }
    const aProjection = projectPolygon(a, axis)
    const bProjection = projectPolygon(b, axis)
    if (aProjection.max < bProjection.min || bProjection.max < aProjection.min) {
      return true
    }
  }
  return false
}

function projectPolygon(points: Vec2[], axis: Vec2): { min: number, max: number } {
  let min = dot(points[0], axis)
  let max = min
  for (let i = 1; i < points.length; i++) {
    const projected = dot(points[i], axis)
    min = Math.min(min, projected)
    max = Math.max(max, projected)
  }
  return { min, max }
}

function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    const intersects = (pi.y > point.y) !== (pj.y > point.y)
      && point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x
    if (intersects) inside = !inside
  }
  return inside
}

function distancePointToSegmentSquared(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return distanceSquared(point, a)

  const t = Math.max(0, Math.min(1, (
    (point.x - a.x) * dx + (point.y - a.y) * dy
  ) / (dx * dx + dy * dy)))
  return distanceSquared(point, {
    x: a.x + t * dx,
    y: a.y + t * dy,
  })
}

function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}
