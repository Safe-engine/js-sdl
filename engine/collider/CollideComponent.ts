import { ComponentX, type BaseComponentProps } from '../core/ComponentX'
import { circleCircle, polygonCircle, polygonPolygon, rectIntersectsRect } from '../helper/Intersection'
import { Rect, Vec2 } from '../helper/math'
export interface ColliderProps extends BaseComponentProps<Collider> {
  tag?: number
  offset?: [number, number]
  enabled?: boolean
  onCollisionEnter?: (other: Collider) => void
  onCollisionStay?: (other: Collider) => void
  onCollisionExit?: (other: Collider) => void
}

export interface BoxColliderProps extends ColliderProps {
  width?: number
  height?: number
}

export interface CircleColliderProps extends ColliderProps {
  radius: number
}

export interface PolygonColliderProps extends ColliderProps {
  points: Array<Vec2 | [number, number]>
}

export const CollisionType = {
  NONE: 0,
  ENTER: 1,
  STAY: 2,
  EXIT: 3,
} as const

export class Collider<Props extends ColliderProps = ColliderProps> extends ComponentX<Props> {
  tag = 0
  readonly worldPoints: Vec2[] = []
  worldPosition = Vec2()
  worldRadius = 0
  readonly aabb = Rect()
  readonly previousAabb = Rect()
  /** Engine-internal: CollideSystem bookkeeping (sweep membership, pair id cache). */
  _sweepStamp = 0
  _pairIdOwner: object | null = null
  _pairId = 0

  onAwake(): void {
    this.syncProps()
  }

  onCollisionEnter(_other: Collider): void { }
  onCollisionStay(_other: Collider): void { }
  onCollisionExit(_other: Collider): void { }

  refresh(): void {
    this.syncProps()
  }

  getAABB(): Rect {
    return this.aabb
  }

  protected syncProps(): void {
    this.tag = this.props.tag ?? this.tag
    this.enabled = this.props.enabled ?? true
  }

  protected copyAabb(): void {
    this.previousAabb.x = this.aabb.x
    this.previousAabb.y = this.aabb.y
    this.previousAabb.width = this.aabb.width
    this.previousAabb.height = this.aabb.height
  }

  protected localToWorld(localX: number, localY: number): Vec2 {
    return this.setWorldPoint({ x: 0, y: 0 }, localX, localY)
  }

  /**
   * Maps a node-local point through the node's world matrix into `out`.
   * Refresh runs for every collider each frame, so this avoids allocating and
   * the per-point trigonometry of decomposed rotation/scale.
   */
  protected setWorldPoint(out: Vec2, localX: number, localY: number): Vec2 {
    const m = this.node!.worldMatrix
    out.x = m.a * localX + m.c * localY + m.tx
    out.y = m.b * localX + m.d * localY + m.ty
    return out
  }

  /** Resizes `worldPoints` to `count`, reusing the existing point objects. */
  protected resizeWorldPoints(count: number): Vec2[] {
    const points = this.worldPoints
    while (points.length < count) points.push({ x: 0, y: 0 })
    points.length = count
    return points
  }

  protected setAabbFromPoints(points: Vec2[]): void {
    this.copyAabb()
    if (!points.length) {
      this.aabb.x = 0
      this.aabb.y = 0
      this.aabb.width = 0
      this.aabb.height = 0
      return
    }

    let minX = points[0].x
    let maxX = minX
    let minY = points[0].y
    let maxY = minY
    for (let i = 1; i < points.length; i++) {
      const x = points[i].x
      const y = points[i].y
      if (x < minX) minX = x
      else if (x > maxX) maxX = x
      if (y < minY) minY = y
      else if (y > maxY) maxY = y
    }
    this.aabb.x = minX
    this.aabb.y = minY
    this.aabb.width = maxX - minX
    this.aabb.height = maxY - minY
  }
}

export class BoxCollider extends Collider<BoxColliderProps> {
  refresh(): void {
    super.refresh()
    if (!this.node) return

    const width = this.props.width ?? this.node.width
    const height = this.props.height ?? this.node.height
    const offset = this.props.offset
    const left = (offset ? offset[0] : 0) - width * this.node.anchorX
    const top = (offset ? offset[1] : 0) - height * this.node.anchorY
    const right = left + width
    const bottom = top + height

    const points = this.resizeWorldPoints(4)
    this.setWorldPoint(points[0], left, top)
    this.setWorldPoint(points[1], left, bottom)
    this.setWorldPoint(points[2], right, bottom)
    this.setWorldPoint(points[3], right, top)
    this.setAabbFromPoints(points)
  }
}

export class CircleCollider extends Collider<CircleColliderProps> {
  refresh(): void {
    super.refresh()
    if (!this.node) return

    const offset = this.props.offset
    this.setWorldPoint(this.worldPosition, offset ? offset[0] : 0, offset ? offset[1] : 0)
    this.worldRadius = this.props.radius * Math.max(
      Math.abs(this.node.worldScaleX),
      Math.abs(this.node.worldScaleY),
    )

    this.copyAabb()
    this.aabb.x = this.worldPosition.x - this.worldRadius
    this.aabb.y = this.worldPosition.y - this.worldRadius
    this.aabb.width = this.worldRadius * 2
    this.aabb.height = this.worldRadius * 2
  }
}

export class PolygonCollider extends Collider<PolygonColliderProps> {
  get points(): Vec2[] {
    return this.props.points.map(point => Array.isArray(point)
      ? { x: point[0], y: point[1] }
      : { x: point.x, y: point.y })
  }

  set points(points: Vec2[]) {
    this.props.points = points
  }

  refresh(): void {
    super.refresh()
    if (!this.node) return

    const offset = this.props.offset
    const offsetX = offset ? offset[0] : 0
    const offsetY = offset ? offset[1] : 0
    const localPoints = this.props.points
    const points = this.resizeWorldPoints(localPoints.length)
    for (let i = 0; i < localPoints.length; i++) {
      const point = localPoints[i]
      const x = Array.isArray(point) ? point[0] : point.x
      const y = Array.isArray(point) ? point[1] : point.y
      this.setWorldPoint(points[i], x + offsetX, y + offsetY)
    }
    this.setAabbFromPoints(points)
  }
}

export class Contact {
  readonly collider1: Collider
  readonly collider2: Collider
  private touching = false

  constructor(collider1: Collider, collider2: Collider) {
    this.collider1 = collider1
    this.collider2 = collider2
  }

  get isTouching(): boolean {
    return this.touching
  }

  updateState() {
    const hit = this.test()
    if (hit && !this.touching) {
      this.touching = true
      return CollisionType.ENTER
    }
    if (hit && this.touching) return CollisionType.STAY
    if (!hit && this.touching) {
      this.touching = false
      return CollisionType.EXIT
    }
    return CollisionType.NONE
  }

  test() {
    return testCollision(this.collider1, this.collider2)
  }
}

function isCircleCollider(collider: Collider): collider is CircleCollider {
  return collider instanceof CircleCollider
}

function isPolygonCollider(collider: Collider): collider is BoxCollider | PolygonCollider {
  return collider instanceof BoxCollider || collider instanceof PolygonCollider
}

export function testCollision(a: Collider, b: Collider) {
  if (!a.enabled || !b.enabled) return false
  if (!rectIntersectsRect(a.getAABB(), b.getAABB())) return false

  if (isCircleCollider(a) && isCircleCollider(b)) {
    return circleCircle(a.worldPosition, a.worldRadius, b.worldPosition, b.worldRadius)
  }

  if (isPolygonCollider(a) && isPolygonCollider(b)) {
    return polygonPolygon(a.worldPoints, b.worldPoints)
  }

  if (isPolygonCollider(a) && isCircleCollider(b)) {
    return polygonCircle(a.worldPoints, b.worldPosition, b.worldRadius)
  }

  if (isCircleCollider(a) && isPolygonCollider(b)) {
    return polygonCircle(b.worldPoints, a.worldPosition, a.worldRadius)
  }

  return false
}
