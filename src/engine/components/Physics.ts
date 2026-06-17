import * as box2d from "box2d";
import {
  drawCircle,
  drawLine,
  drawPoint,
  drawPolyline,
  type DrawPoint,
} from "sdl3";
import { Component } from "../core/Component";
import type { Node } from "../core/Node";

export type BodyType = "static" | "kinematic" | "dynamic" | 0 | 1 | 2;
export type Float = number;
export type ContactValue = unknown;
export type PhysicsShape = PhysicsShapeDef;

export interface Vec2Value {
  x: Float;
  y: Float;
}

export interface PhysicsShapeDef {
  kind: "box" | "circle" | "polygon" | "edge";
  width?: Float;
  height?: Float;
  radius?: Float;
  x?: Float;
  y?: Float;
  angle?: Float;
  points?: Vec2Value[];
}

export interface RigidBodyProps {
  type?: BodyType;
  density?: Float;
  restitution?: Float;
  friction?: Float;
  gravityScale?: Float;
  isSensor?: boolean;
  tag?: number;
  onBeginContact?: (other: RigidBody) => void;
  onEndContact?: (other: RigidBody) => void;
  onPreSolve?: (other: RigidBody, impulse?: ContactValue) => void;
  onPostSolve?: (other: RigidBody, oldManifold?: ContactValue) => void;

  shapes: PhysicsShape | PhysicsShape[];
}

export interface PhysicsWorldProps {
  gravity?: Vec2Value;
  pixelsPerMeter?: Float;
  velocityIterations?: number;
  positionIterations?: number;
  fixedTimeStep?: Float;
  maxSubSteps?: number;
  debugDraw?: boolean | PhysicsDebugDrawOptions;
}

export interface PhysicsDebugDrawOptions {
  enabled?: boolean;
  alpha?: number;
}

const DEFAULT_PIXELS_PER_METER = 32;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

let activePhysicsWorld: PhysicsWorld | null = null;

export class Vec2 implements Vec2Value {
  constructor(public x = 0, public y = 0) {}
}

export const World = box2d;
export const CircleShape = circle;
export const BoxShape = box;
export const PolygonShape = polygon;
export const EdgeShape = edge;
export const ChainShape = polygon;

export function box(width: Float, height: Float, x = 0, y = 0, angle = 0): PhysicsShapeDef {
  return { kind: "box", width, height, x, y, angle };
}

export function circle(radius: Float, x = 0, y = 0): PhysicsShapeDef {
  return { kind: "circle", radius, x, y };
}

export function polygon(points: Vec2Value[]): PhysicsShapeDef {
  return { kind: "polygon", points };
}

export function edge(a: Vec2Value, b: Vec2Value): PhysicsShapeDef {
  return { kind: "edge", points: [a, b] };
}

export class PhysicsWorld extends Component<PhysicsWorldProps> {
  world = 0;
  pixelsPerMeter = DEFAULT_PIXELS_PER_METER;
  velocityIterations = 4;
  positionIterations = 3;
  fixedTimeStep = 1 / 60;
  maxSubSteps = 5;
  private accumulator = 0;
  private nextContactId = 1;
  private readonly bodies = new Set<RigidBody>();
  private readonly contactIds = new Map<number, RigidBody>();

  onAwake(): void {
    const props = this.props;
    activePhysicsWorld = this;
    this.pixelsPerMeter = props.pixelsPerMeter ?? this.pixelsPerMeter;
    this.velocityIterations = props.velocityIterations ?? this.velocityIterations;
    this.positionIterations = props.positionIterations ?? this.positionIterations;
    this.fixedTimeStep = props.fixedTimeStep ?? this.fixedTimeStep;
    this.maxSubSteps = props.maxSubSteps ?? this.maxSubSteps;
    this.world = box2d.createWorld(props.gravity ?? { x: 0, y: 9.8 });
    if (!this.world) throw new Error("Failed to create Box2D world.");
  }

  onDestroy(): void {
    if (activePhysicsWorld === this) activePhysicsWorld = null;
    if (this.world) box2d.destroyWorld(this.world);
    this.world = 0;
    this.bodies.clear();
    this.contactIds.clear();
  }

  onUpdate(dt: number): void {
    if (!this.world) return;
    if (this.fixedTimeStep <= 0) {
      this.step(dt);
      return;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.fixedTimeStep && steps < this.maxSubSteps) {
      this.step(this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0;
  }

  onRenderEnd(): void {
    const debugDraw = this.props.debugDraw;
    const enabled = typeof debugDraw === "boolean"
      ? debugDraw
      : debugDraw?.enabled ?? false;
    if (!enabled || !this.world) return;

    const alpha = typeof debugDraw === "object" ? debugDraw.alpha ?? 180 : 180;
    for (const primitive of box2d.getDebugDraw(this.world, this.pixelsPerMeter)) {
      const color = debugColor(primitive.color, alpha);
      switch (primitive.type) {
        case "line":
          drawLine(primitive.x1, primitive.y1, primitive.x2, primitive.y2, color.r, color.g, color.b, color.a);
          break;
        case "circle":
          drawCircle(
            primitive.x,
            primitive.y,
            primitive.radius,
            color.r,
            color.g,
            color.b,
            primitive.fill ? Math.min(color.a, 72) : color.a,
            primitive.fill ?? false,
          );
          break;
        case "polygon":
          drawPolyline(
            primitive.points as DrawPoint[],
            color.r,
            color.g,
            color.b,
            primitive.fill ? Math.min(color.a, 96) : color.a,
            true,
          );
          break;
        case "point":
          drawPoint(primitive.x, primitive.y, color.r, color.g, color.b, color.a);
          break;
      }
    }
  }

  createBody(rigidBody: RigidBody): number {
    if (!this.world) throw new Error("PhysicsWorld is not initialized.");
    const node = rigidBody.node!;
    const contactId = this.nextContactId++;
    const body = box2d.createBody(
      this.world,
      toNativeBodyType(rigidBody.props.type ?? "dynamic"),
      this.toWorldPoint(node.worldX, node.worldY),
      node.worldRotation * DEG_TO_RAD,
      rigidBody.props.gravityScale ?? 1,
      contactId,
    );
    if (!body) throw new Error("Failed to create Box2D body.");

    rigidBody.contactId = contactId;
    this.bodies.add(rigidBody);
    this.contactIds.set(contactId, rigidBody);

    for (const shape of asArray(rigidBody.props.shapes)) {
      this.createShape(body, shape, rigidBody.props);
    }

    return body;
  }

  destroyBody(body: number): void {
    if (body) box2d.destroyBody(body);
    for (const rigidBody of this.bodies) {
      if (rigidBody.body !== body) continue;
      this.bodies.delete(rigidBody);
      if (rigidBody.contactId) this.contactIds.delete(rigidBody.contactId);
      rigidBody.contactId = 0;
      break;
    }
  }

  toWorldPoint(x: number, y: number): Vec2 {
    return new Vec2(x / this.pixelsPerMeter, y / this.pixelsPerMeter);
  }

  toNodePoint(point: Vec2Value): Vec2 {
    return new Vec2(point.x * this.pixelsPerMeter, point.y * this.pixelsPerMeter);
  }

  private step(dt: number): void {
    box2d.stepWorld(this.world, dt, this.velocityIterations);
    this.dispatchContactEvents();
    this.syncBodies();
  }

  private createShape(body: number, shape: PhysicsShape, props: RigidBodyProps): void {
    const density = props.density ?? 1;
    const friction = props.friction ?? 0.2;
    const restitution = props.restitution ?? 0;
    const isSensor = props.isSensor ?? false;

    switch (shape.kind) {
      case "box":
        box2d.createBoxShape(
          body,
          (shape.width ?? 0) / this.pixelsPerMeter / 2,
          (shape.height ?? 0) / this.pixelsPerMeter / 2,
          this.toWorldPoint(shape.x ?? 0, shape.y ?? 0),
          (shape.angle ?? 0) * DEG_TO_RAD,
          density,
          friction,
          restitution,
          isSensor,
        );
        break;
      case "circle":
        box2d.createCircleShape(
          body,
          (shape.radius ?? 0) / this.pixelsPerMeter,
          this.toWorldPoint(shape.x ?? 0, shape.y ?? 0),
          density,
          friction,
          restitution,
          isSensor,
        );
        break;
      case "polygon":
        box2d.createPolygonShape(
          body,
          (shape.points ?? []).map((point) => this.toWorldPoint(point.x, point.y)),
          density,
          friction,
          restitution,
          isSensor,
        );
        break;
      case "edge": {
        const [a, b] = shape.points ?? [];
        box2d.createSegmentShape(
          body,
          this.toWorldPoint(a?.x ?? 0, a?.y ?? 0),
          this.toWorldPoint(b?.x ?? 0, b?.y ?? 0),
          density,
          friction,
          restitution,
          isSensor,
        );
        break;
      }
    }
  }

  private dispatchContactEvents(): void {
    const events = box2d.getContactEvents(this.world);
    for (const [aId, bId] of events.begin) {
      this.dispatchContact(aId, bId, (body, other) => body.props.onBeginContact?.(other));
    }
    for (const [aId, bId] of events.end) {
      this.dispatchContact(aId, bId, (body, other) => body.props.onEndContact?.(other));
    }
  }

  private dispatchContact(
    aId: number,
    bId: number,
    callback: (body: RigidBody, other: RigidBody) => void,
  ): void {
    const a = this.contactIds.get(aId);
    const b = this.contactIds.get(bId);
    if (!a || !b) return;
    callback(a, b);
    callback(b, a);
  }

  private syncBodies(): void {
    for (const rigidBody of this.bodies) {
      rigidBody.syncNodeFromBody();
    }
  }
}

export class RigidBody extends Component<RigidBodyProps> {
  body: number | null = null;
  contactId = 0;
  world: PhysicsWorld | null = null;

  get tag(): number | undefined {
    return this.props.tag;
  }

  onStart(): void {
    this.ensureBody();
  }

  onDestroy(): void {
    if (this.body && this.world) {
      this.world.destroyBody(this.body);
    }
    this.body = null;
    this.world = null;
    this.contactId = 0;
  }

  syncNodeFromBody(): void {
    if (!this.body || !this.node || toNativeBodyType(this.props.type ?? "dynamic") === 0) return;
    const transform = box2d.getBodyTransform(this.body);
    if (!transform) return;
    const p = this.world!.toNodePoint(transform);
    this.node.x = p.x;
    this.node.y = p.y;
    this.node.rotation = transform.angle * RAD_TO_DEG;
  }

  syncBodyFromNode(): void {
    if (!this.body || !this.world || !this.node) return;
    box2d.setBodyTransform(
      this.body,
      this.world.toWorldPoint(this.node.worldX, this.node.worldY),
      this.node.worldRotation * DEG_TO_RAD,
    );
  }

  setVelocity(x: Float, y: Float): void {
    if (!this.body) return;
    box2d.setLinearVelocity(this.body, { x, y });
  }

  applyForce(x: Float, y: Float): void {
    if (!this.body) return;
    box2d.applyForceToCenter(this.body, { x, y });
  }

  applyImpulse(x: Float, y: Float): void {
    if (!this.body) return;
    box2d.applyLinearImpulseToCenter(this.body, { x, y });
  }

  private ensureBody(): void {
    if (this.body) return;
    this.world = findPhysicsWorld(this.node);
    if (!this.world) {
      throw new Error("RigidBody requires a PhysicsWorld component on this node or an ancestor.");
    }
    this.body = this.world.createBody(this);
  }
}

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function toNativeBodyType(type: BodyType): 0 | 1 | 2 {
  if (type === "static" || type === 0) return 0;
  if (type === "kinematic" || type === 1) return 1;
  return 2;
}

function findPhysicsWorld(node: Node | null = null): PhysicsWorld | null {
  for (let current = node; current; current = current.parent) {
    const world = current.getComponent(PhysicsWorld);
    if (world) return world;
  }
  return activePhysicsWorld;
}

function debugColor(hex: number, alpha: number): { r: number; g: number; b: number; a: number } {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
    a: alpha,
  };
}
