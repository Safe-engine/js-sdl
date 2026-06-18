import { applyForceToCenter, applyLinearImpulseToCenter, createBody, createBoxShape, createCircleShape, createPolygonShape, createSegmentShape, createWorld, destroyBody, destroyWorld, getBodyTransform, getContactEvents, getDebugDraw, setBodyTransform, setLinearVelocity, stepWorld } from "box2d";
import {
  drawCircle,
  drawLine,
  drawPoint,
  drawPolyline,
  type DrawPoint,
} from "sdl3";
import {
  asArray,
  box,
  circle,
  debugColor,
  DEG_TO_RAD,
  edge,
  PhysicsRigidBodyComponent,
  PhysicsWorldComponent,
  polygon,
  RAD_TO_DEG,
  type RigidBodyProps as BaseRigidBodyProps,
  type BodyType,
  type PhysicsDebugDrawOptions,
  type PhysicsShapeDef,
  type PhysicsWorldProps,
} from "./PhysicsComponent";

export type {
  BodyType,
  PhysicsDebugDrawOptions,
  PhysicsShapeDef,
  PhysicsWorldProps
};
export type ContactValue = unknown;
export type PhysicsShape = PhysicsShapeDef;
export type RigidBodyProps = BaseRigidBodyProps<RigidBody, PhysicsShape, ContactValue>;

export const CircleShape = circle;
export const BoxShape = box;
export const PolygonShape = polygon;
export const EdgeShape = edge;
export const ChainShape = polygon;
export { box, circle, edge, polygon };

export class PhysicsWorld extends PhysicsWorldComponent<PhysicsWorldProps> {
  world = 0;
  velocityIterations = 4;
  private nextContactId = 1;
  private readonly bodies = new Set<RigidBody>();
  private readonly contactIds = new Map<number, RigidBody>();

  onAwake(): void {
    super.onAwake();
    this.world = createWorld(this.props.gravity ?? { x: 0, y: 9.8 });
    if (!this.world) throw new Error("Failed to create Box2D world.");
  }

  onDestroy(): void {
    super.onDestroy();
    if (this.world) destroyWorld(this.world);
    this.world = 0;
    this.bodies.clear();
    this.contactIds.clear();
  }

  onRenderEnd(): void {
    if (!this.debugDrawEnabled || !this.world) return;

    for (const primitive of getDebugDraw(this.world, this.pixelsPerMeter)) {
      const color = debugColor(primitive.color, this.debugDrawAlpha);
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
    const body = createBody(
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
    if (body) destroyBody(body);
    for (const rigidBody of this.bodies) {
      if (rigidBody.body !== body) continue;
      this.bodies.delete(rigidBody);
      if (rigidBody.contactId) this.contactIds.delete(rigidBody.contactId);
      rigidBody.contactId = 0;
      break;
    }
  }

  toWorldPoint(x: number, y: number): Vec2 {
    const point = this.toWorldPointValue(x, y);
    return point
  }

  toNodePoint(point: Vec2): Vec2 {
    const nodePoint = this.toNodePointValue(point);
    return nodePoint
  }

  protected stepPhysics(dt: number): void {
    if (!this.world) return;
    stepWorld(this.world, dt, this.velocityIterations);
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
        createBoxShape(
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
        createCircleShape(
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
        createPolygonShape(
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
        createSegmentShape(
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
    const events = getContactEvents(this.world);
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

export class RigidBody extends PhysicsRigidBodyComponent<PhysicsWorld, number, RigidBodyProps> {
  contactId = 0;

  onDestroy(): void {
    super.onDestroy();
    this.contactId = 0;
  }

  syncNodeFromBody(): void {
    if (!this.body || !this.node || toNativeBodyType(this.props.type ?? "dynamic") === 0) return;
    const transform = getBodyTransform(this.body);
    if (!transform) return;
    const p = this.world!.toNodePoint(transform);
    this.node.x = p.x;
    this.node.y = p.y;
    this.node.rotation = transform.angle * RAD_TO_DEG;
  }

  syncBodyFromNode(): void {
    if (!this.body || !this.world || !this.node) return;
    setBodyTransform(
      this.body,
      this.world.toWorldPoint(this.node.worldX, this.node.worldY),
      this.node.worldRotation * DEG_TO_RAD,
    );
  }

  setVelocity(x: Float, y: Float): void {
    if (!this.body) return;
    setLinearVelocity(this.body, { x, y });
  }

  applyForce(x: Float, y: Float): void {
    if (!this.body) return;
    applyForceToCenter(this.body, { x, y });
  }

  applyImpulse(x: Float, y: Float): void {
    if (!this.body) return;
    applyLinearImpulseToCenter(this.body, { x, y });
  }

  protected getWorldConstructor(): typeof PhysicsWorld {
    return PhysicsWorld;
  }
}

function toNativeBodyType(type: BodyType): 0 | 1 | 2 {
  if (type === "static" || type === 0) return 0;
  if (type === "kinematic" || type === 1) return 1;
  return 2;
}
