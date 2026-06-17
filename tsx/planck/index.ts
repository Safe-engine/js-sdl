import * as planck from "planck";
import { Component } from "../../src/engine/core/Component";
import type { Node } from "../../src/engine/core/Node";

export type BodyType = planck.BodyType;
export type Float = number;
export type PhysicsShape = planck.Shape | PhysicsShapeDef;
export type ContactValue = planck.Contact | planck.Manifold | planck.ContactImpulse;

export interface PhysicsShapeDef {
  kind: "box" | "circle" | "polygon" | "edge";
  width?: Float;
  height?: Float;
  radius?: Float;
  x?: Float;
  y?: Float;
  angle?: Float;
  points?: planck.Vec2Value[];
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
  gravity?: planck.Vec2Value;
  pixelsPerMeter?: Float;
  velocityIterations?: number;
  positionIterations?: number;
  fixedTimeStep?: Float;
  maxSubSteps?: number;
}

const DEFAULT_PIXELS_PER_METER = 32;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

interface BodyUserData {
  rigidBody: RigidBody;
}

let activePhysicsWorld: PhysicsWorld | null = null;

export const Vec2 = planck.Vec2;
export const World = planck.World;
export const CircleShape = planck.CircleShape;
export const BoxShape = planck.BoxShape;
export const PolygonShape = planck.PolygonShape;
export const EdgeShape = planck.EdgeShape;
export const ChainShape = planck.ChainShape;

export function box(width: Float, height: Float, x = 0, y = 0, angle = 0): PhysicsShapeDef {
  return { kind: "box", width, height, x, y, angle };
}

export function circle(radius: Float, x = 0, y = 0): PhysicsShapeDef {
  return { kind: "circle", radius, x, y };
}

export function polygon(points: planck.Vec2Value[]): PhysicsShapeDef {
  return { kind: "polygon", points };
}

export function edge(a: planck.Vec2Value, b: planck.Vec2Value): PhysicsShapeDef {
  return { kind: "edge", points: [a, b] };
}

export class PhysicsWorld extends Component<PhysicsWorldProps> {
  readonly world = new planck.World({ x: 0, y: 9.8 });
  pixelsPerMeter = DEFAULT_PIXELS_PER_METER;
  velocityIterations = 8;
  positionIterations = 3;
  fixedTimeStep = 1 / 60;
  maxSubSteps = 5;
  private accumulator = 0;

  onAwake(): void {
    const props = this.props;
    activePhysicsWorld = this;
    this.pixelsPerMeter = props.pixelsPerMeter ?? this.pixelsPerMeter;
    this.velocityIterations = props.velocityIterations ?? this.velocityIterations;
    this.positionIterations = props.positionIterations ?? this.positionIterations;
    this.fixedTimeStep = props.fixedTimeStep ?? this.fixedTimeStep;
    this.maxSubSteps = props.maxSubSteps ?? this.maxSubSteps;
    if (props.gravity) this.world.setGravity(props.gravity);
    this.installContactListeners();
  }

  onDestroy(): void {
    if (activePhysicsWorld === this) activePhysicsWorld = null;
  }

  onUpdate(dt: number): void {
    if (this.fixedTimeStep <= 0) {
      this.world.step(dt, this.velocityIterations, this.positionIterations);
      this.syncBodies();
      return;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.fixedTimeStep && steps < this.maxSubSteps) {
      this.world.step(this.fixedTimeStep, this.velocityIterations, this.positionIterations);
      this.accumulator -= this.fixedTimeStep;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0;
    this.syncBodies();
  }

  createBody(rigidBody: RigidBody): planck.Body {
    const node = rigidBody.node!;
    const body = this.world.createBody({
      type: rigidBody.props.type ?? "dynamic",
      position: this.toWorldPoint(node.worldX, node.worldY),
      angle: node.worldRotation * DEG_TO_RAD,
      gravityScale: rigidBody.props.gravityScale,
      userData: { rigidBody } satisfies BodyUserData,
    });

    for (const shape of asArray(rigidBody.props.shapes)) {
      body.createFixture(toPlanckShape(shape, this.pixelsPerMeter), {
        density: rigidBody.props.density ?? 1,
        restitution: rigidBody.props.restitution ?? 0,
        friction: rigidBody.props.friction ?? 0.2,
        isSensor: rigidBody.props.isSensor ?? false,
        userData: rigidBody,
      });
    }

    return body;
  }

  destroyBody(body: planck.Body): void {
    this.world.destroyBody(body);
  }

  toWorldPoint(x: number, y: number): planck.Vec2 {
    return new planck.Vec2(x / this.pixelsPerMeter, y / this.pixelsPerMeter);
  }

  toNodePoint(point: planck.Vec2Value): planck.Vec2 {
    return new planck.Vec2(point.x * this.pixelsPerMeter, point.y * this.pixelsPerMeter);
  }

  private installContactListeners(): void {
    this.world.on("begin-contact", (contact) => {
      dispatchContact(contact, (body, other) => body.props.onBeginContact?.(other));
    });
    this.world.on("end-contact", (contact) => {
      dispatchContact(contact, (body, other) => body.props.onEndContact?.(other));
    });
    this.world.on("pre-solve", (contact, oldManifold) => {
      dispatchContact(contact, (body, other) => body.props.onPreSolve?.(other, oldManifold));
    });
    this.world.on("post-solve", (contact, impulse) => {
      dispatchContact(contact, (body, other) => body.props.onPostSolve?.(other, impulse));
    });
  }

  private syncBodies(): void {
    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      const rigidBody = getRigidBody(body);
      if (rigidBody) rigidBody.syncNodeFromBody();
    }
  }
}

export class RigidBody extends Component<RigidBodyProps> {
  body: planck.Body | null = null;
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
  }

  syncNodeFromBody(): void {
    if (!this.body || !this.node || this.body.isStatic()) return;
    const p = this.world!.toNodePoint(this.body.getPosition());
    this.node.x = p.x;
    this.node.y = p.y;
    this.node.rotation = this.body.getAngle() * RAD_TO_DEG;
  }

  syncBodyFromNode(): void {
    if (!this.body || !this.world || !this.node) return;
    this.body.setTransform(
      this.world.toWorldPoint(this.node.worldX, this.node.worldY),
      this.node.worldRotation * DEG_TO_RAD,
    );
  }

  setVelocity(x: Float, y: Float): void {
    this.body?.setLinearVelocity(new planck.Vec2(x, y));
  }

  applyForce(x: Float, y: Float): void {
    if (!this.body) return;
    this.body.applyForceToCenter(new planck.Vec2(x, y), true);
  }

  applyImpulse(x: Float, y: Float): void {
    if (!this.body) return;
    this.body.applyLinearImpulse(new planck.Vec2(x, y), this.body.getWorldCenter(), true);
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

function toPlanckShape(shape: PhysicsShape, pixelsPerMeter: number): planck.Shape {
  if (shape instanceof planck.Shape) return shape;

  switch (shape.kind) {
    case "box":
      return new planck.BoxShape(
        (shape.width ?? 0) / pixelsPerMeter / 2,
        (shape.height ?? 0) / pixelsPerMeter / 2,
        new planck.Vec2((shape.x ?? 0) / pixelsPerMeter, (shape.y ?? 0) / pixelsPerMeter),
        (shape.angle ?? 0) * DEG_TO_RAD,
      );
    case "circle":
      return new planck.CircleShape(
        new planck.Vec2((shape.x ?? 0) / pixelsPerMeter, (shape.y ?? 0) / pixelsPerMeter),
        (shape.radius ?? 0) / pixelsPerMeter,
      );
    case "polygon":
      return new planck.PolygonShape((shape.points ?? []).map((p) => ({
        x: p.x / pixelsPerMeter,
        y: p.y / pixelsPerMeter,
      })));
    case "edge": {
      const [a, b] = shape.points ?? [];
      return new planck.EdgeShape(
        new planck.Vec2((a?.x ?? 0) / pixelsPerMeter, (a?.y ?? 0) / pixelsPerMeter),
        new planck.Vec2((b?.x ?? 0) / pixelsPerMeter, (b?.y ?? 0) / pixelsPerMeter),
      );
    }
  }
}

function findPhysicsWorld(node: Node | null = null): PhysicsWorld | null {
  for (let current = node; current; current = current.parent) {
    const world = current.getComponent(PhysicsWorld);
    if (world) return world;
  }
  return activePhysicsWorld;
}

function getRigidBody(body: planck.Body): RigidBody | null {
  return ((body.getUserData() as BodyUserData | null)?.rigidBody) ?? null;
}

function dispatchContact(
  contact: planck.Contact,
  callback: (body: RigidBody, other: RigidBody) => void,
): void {
  const a = getRigidBody(contact.getFixtureA().getBody());
  const b = getRigidBody(contact.getFixtureB().getBody());
  if (!a || !b) return;
  callback(a, b);
  callback(b, a);
}
