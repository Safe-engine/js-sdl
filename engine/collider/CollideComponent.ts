import { ComponentX, type BaseComponentProps } from "../core/ComponentX";
export interface ColliderProps extends BaseComponentProps<Collider> {
  tag?: number;
  offset?: [number, number];
  enabled?: boolean;
  onCollisionEnter?: (other: Collider) => void;
  onCollisionStay?: (other: Collider) => void;
  onCollisionExit?: (other: Collider) => void;
}

export interface BoxColliderProps extends ColliderProps {
  width?: number;
  height?: number;
}

export interface CircleColliderProps extends ColliderProps {
  radius: number;
}

export interface PolygonColliderProps extends ColliderProps {
  points: Array<Vec2 | [number, number]>;
}

export enum CollisionType {
  NONE,
  ENTER,
  STAY,
  EXIT,
}

export class Collider<Props extends ColliderProps = ColliderProps> extends ComponentX<Props> {
  tag = 0;
  enabled = true;
  readonly worldPoints: Vec2[] = [];
  worldPosition: Vec2 = { x: 0, y: 0 };
  worldRadius = 0;
  readonly aabb: Rect = { x: 0, y: 0, width: 0, height: 0 };
  readonly previousAabb: Rect = { x: 0, y: 0, width: 0, height: 0 };

  onAwake(): void {
    this.syncProps();
  }

  onCollisionEnter(_other: Collider): void {}
  onCollisionStay(_other: Collider): void {}
  onCollisionExit(_other: Collider): void {}

  refresh(): void {
    this.syncProps();
  }

  getAABB(): Rect {
    return this.aabb;
  }

  protected syncProps(): void {
    this.tag = this.props.tag ?? this.tag;
    this.enabled = this.props.enabled ?? true;
  }

  protected copyAabb(): void {
    this.previousAabb.x = this.aabb.x;
    this.previousAabb.y = this.aabb.y;
    this.previousAabb.width = this.aabb.width;
    this.previousAabb.height = this.aabb.height;
  }

  protected localToWorld(localX: number, localY: number): Vec2 {
    const node = this.node!;
    const x = localX * node.worldScaleX;
    const y = localY * node.worldScaleY;
    const radians = node.worldRotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
      x: node.worldX + x * cos - y * sin,
      y: node.worldY + x * sin + y * cos,
    };
  }

  protected setAabbFromPoints(points: Vec2[]): void {
    this.copyAabb();
    if (!points.length) {
      this.aabb.x = 0;
      this.aabb.y = 0;
      this.aabb.width = 0;
      this.aabb.height = 0;
      return;
    }

    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    this.aabb.x = minX;
    this.aabb.y = minY;
    this.aabb.width = maxX - minX;
    this.aabb.height = maxY - minY;
  }
}

export class BoxCollider extends Collider<BoxColliderProps> {
  refresh(): void {
    super.refresh();
    if (!this.node) return;

    const width = this.props.width ?? this.node.width;
    const height = this.props.height ?? this.node.height;
    const [offsetX, offsetY] = this.props.offset ?? [0, 0];
    const left = offsetX - width * this.node.anchorX;
    const top = offsetY - height * this.node.anchorY;
    const right = left + width;
    const bottom = top + height;

    this.worldPoints.length = 0;
    this.worldPoints.push(
      this.localToWorld(left, top),
      this.localToWorld(left, bottom),
      this.localToWorld(right, bottom),
      this.localToWorld(right, top),
    );
    this.setAabbFromPoints(this.worldPoints);
  }
}

export class CircleCollider extends Collider<CircleColliderProps> {
  refresh(): void {
    super.refresh();
    if (!this.node) return;

    const [offsetX, offsetY] = this.props.offset ?? [0, 0];
    this.worldPosition = this.localToWorld(offsetX, offsetY);
    this.worldRadius = this.props.radius * Math.max(
      Math.abs(this.node.worldScaleX),
      Math.abs(this.node.worldScaleY),
    );

    this.copyAabb();
    this.aabb.x = this.worldPosition.x - this.worldRadius;
    this.aabb.y = this.worldPosition.y - this.worldRadius;
    this.aabb.width = this.worldRadius * 2;
    this.aabb.height = this.worldRadius * 2;
  }
}

export class PolygonCollider extends Collider<PolygonColliderProps> {
  get points(): Vec2[] {
    return this.props.points.map((point) => Array.isArray(point)
      ? { x: point[0], y: point[1] }
      : { x: point.x, y: point.y });
  }

  set points(points: Vec2[]) {
    this.props.points = points;
  }

  refresh(): void {
    super.refresh();
    if (!this.node) return;

    const [offsetX, offsetY] = this.props.offset ?? [0, 0];
    this.worldPoints.length = 0;
    for (const point of this.points) {
      this.worldPoints.push(this.localToWorld(point.x + offsetX, point.y + offsetY));
    }
    this.setAabbFromPoints(this.worldPoints);
  }
}

export class Contact {
  readonly collider1: Collider;
  readonly collider2: Collider;
  private touching = false;

  constructor(collider1: Collider, collider2: Collider) {
    this.collider1 = collider1;
    this.collider2 = collider2;
  }

  get isTouching(): boolean {
    return this.touching;
  }

  updateState(): CollisionType {
    const hit = this.test();
    if (hit && !this.touching) {
      this.touching = true;
      return CollisionType.ENTER;
    }
    if (hit && this.touching) return CollisionType.STAY;
    if (!hit && this.touching) {
      this.touching = false;
      return CollisionType.EXIT;
    }
    return CollisionType.NONE;
  }

  test(): boolean {
    return testCollision(this.collider1, this.collider2);
  }
}

export function testCollision(a: Collider, b: Collider): boolean {
  if (!a.enabled || !b.enabled) return false;
  if (!rectIntersectsRect(a.getAABB(), b.getAABB())) return false;

  if (isCircleCollider(a) && isCircleCollider(b)) {
    return circleCircle(a.worldPosition, a.worldRadius, b.worldPosition, b.worldRadius);
  }

  if (isPolygonCollider(a) && isPolygonCollider(b)) {
    return polygonPolygon(a.worldPoints, b.worldPoints);
  }

  if (isPolygonCollider(a) && isCircleCollider(b)) {
    return polygonCircle(a.worldPoints, b.worldPosition, b.worldRadius);
  }

  if (isCircleCollider(a) && isPolygonCollider(b)) {
    return polygonCircle(b.worldPoints, a.worldPosition, a.worldRadius);
  }

  return false;
}

export function rectIntersectsRect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width
    && b.x <= a.x + a.width
    && a.y <= b.y + b.height
    && b.y <= a.y + a.height;
}

export function circleCircle(
  a: Vec2,
  ar: number,
  b: Vec2,
  br: number,
): boolean {
  const radius = ar + br;
  return distanceSquared(a, b) <= radius * radius;
}

export function polygonCircle(
  polygon: Vec2[],
  circle: Vec2,
  radius: number,
): boolean {
  if (polygon.length < 3) return false;
  if (pointInPolygon(circle, polygon)) return true;

  const r2 = radius * radius;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (distancePointToSegmentSquared(circle, a, b) <= r2) return true;
  }
  return false;
}

export function polygonPolygon(a: Vec2[], b: Vec2[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  return !hasSeparatingAxis(a, b) && !hasSeparatingAxis(b, a);
}

function isCircleCollider(collider: Collider): collider is CircleCollider {
  return collider instanceof CircleCollider;
}

function isPolygonCollider(collider: Collider): collider is BoxCollider | PolygonCollider {
  return collider instanceof BoxCollider || collider instanceof PolygonCollider;
}

function hasSeparatingAxis(a: Vec2[], b: Vec2[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i];
    const p2 = a[(i + 1) % a.length];
    const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x };
    const aProjection = projectPolygon(a, axis);
    const bProjection = projectPolygon(b, axis);
    if (aProjection.max < bProjection.min || bProjection.max < aProjection.min) {
      return true;
    }
  }
  return false;
}

function projectPolygon(points: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = dot(points[0], axis);
  let max = min;
  for (let i = 1; i < points.length; i++) {
    const projected = dot(points[i], axis);
    min = Math.min(min, projected);
    max = Math.max(max, projected);
  }
  return { min, max };
}

function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = (pi.y > point.y) !== (pj.y > point.y)
      && point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distancePointToSegmentSquared(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return distanceSquared(point, a);

  const t = Math.max(0, Math.min(1, (
    (point.x - a.x) * dx + (point.y - a.y) * dy
  ) / (dx * dx + dy * dy)));
  return distanceSquared(point, {
    x: a.x + t * dx,
    y: a.y + t * dy,
  });
}

function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
