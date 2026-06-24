import { ComponentX, type BaseComponentProps } from '../core/ComponentX';
import { circleCircle, polygonCircle, polygonPolygon, rectIntersectsRect } from '../helper/Intersection';
import { Rect, Vec2 } from '../helper/math';
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
  worldPosition = Vec2();
  worldRadius = 0;
  readonly aabb = Rect();
  readonly previousAabb = Rect();

  onAwake(): void {
    this.syncProps();
  }

  onCollisionEnter(_other: Collider): void { }
  onCollisionStay(_other: Collider): void { }
  onCollisionExit(_other: Collider): void { }

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
    return this.props.points.map(point => Array.isArray(point)
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

function isCircleCollider(collider: Collider): collider is CircleCollider {
  return collider instanceof CircleCollider;
}

function isPolygonCollider(collider: Collider): collider is BoxCollider | PolygonCollider {
  return collider instanceof BoxCollider || collider instanceof PolygonCollider;
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
