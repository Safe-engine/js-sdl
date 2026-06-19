import { Body, BodyType, BoxShape, CircleShape, Contact, ContactImpulse, EdgeShape, Fixture, Manifold, PolygonShape, Shape, Transform, TransformValue, Vec2, World } from "planck";
import {
  drawCircle,
  drawLine,
  drawPoint,
  drawPolyline,
  type DrawPoint,
} from "sdl3";
import {
  DEG_TO_RAD,
  PhysicsRigidBodyComponent,
  PhysicsWorldComponent,
  RAD_TO_DEG,
  asArray,
  box,
  circle,
  debugColor,
  edge,
  polygon,
  type RigidBodyProps as BaseRigidBodyProps,
  type PhysicsDebugDrawOptions,
  type PhysicsShapeDef,
  type PhysicsWorldProps,
} from "./PhysicsComponent";

export type { BodyType, PhysicsDebugDrawOptions, PhysicsShapeDef, PhysicsWorldProps };
export type ContactValue = Contact | Manifold | ContactImpulse;
export type PhysicsShape = Shape | PhysicsShapeDef;
export type RigidBodyProps = BaseRigidBodyProps<RigidBody, PhysicsShape, ContactValue, BodyType>;

interface BodyUserData {
  rigidBody: RigidBody;
}

export { BoxShape, CircleShape, EdgeShape, PolygonShape, Vec2, box, circle, edge, polygon };
export const ChainShape = polygon;

export class PhysicsWorld extends PhysicsWorldComponent<PhysicsWorldProps> {
  readonly world = new World({ x: 0, y: 9.8 });

  onAwake(): void {
    super.onAwake();
    if (this.props.gravity) this.world.setGravity(this.props.gravity);
    this.installContactListeners();
  }

  onRenderEnd(): void {
    if (!this.debugDrawEnabled) return;

    const color = debugColor(this.debugDrawColor, this.debugDrawAlpha);

    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      const transform = body.getTransform();
      for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
        drawFixtureDebug(fixture, transform, this.pixelsPerMeter, color);
      }
    }
  }

  createBody(rigidBody: RigidBody): Body {
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

  destroyBody(body: Body): void {
    this.world.destroyBody(body);
  }

  toWorldPoint(x: number, y: number): Vec2 {
    const point = this.toWorldPointValue(x, y);
    return new Vec2(point.x, point.y);
  }

  toNodePoint(point: Vec2): Vec2 {
    const nodePoint = this.toNodePointValue(point);
    return new Vec2(nodePoint.x, nodePoint.y);
  }

  protected stepPhysics(dt: number): void {
    this.world.step(dt, this.velocityIterations, this.positionIterations);
    this.syncBodies();
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

export class RigidBody extends PhysicsRigidBodyComponent<PhysicsWorld, Body, RigidBodyProps> {
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
    this.body?.setLinearVelocity(new Vec2(x, y));
  }

  applyForce(x: Float, y: Float): void {
    if (!this.body) return;
    this.body.applyForceToCenter(new Vec2(x, y), true);
  }

  applyImpulse(x: Float, y: Float): void {
    if (!this.body) return;
    this.body.applyLinearImpulse(new Vec2(x, y), this.body.getWorldCenter(), true);
  }

  protected getWorldConstructor(): typeof PhysicsWorld {
    return PhysicsWorld;
  }
}

function toPlanckShape(shape: PhysicsShape, pixelsPerMeter: number): Shape {
  if (shape instanceof Shape) return shape;

  switch (shape.kind) {
    case "box":
      return new BoxShape(
        (shape.width ?? 0) / pixelsPerMeter / 2,
        (shape.height ?? 0) / pixelsPerMeter / 2,
        new Vec2((shape.x ?? 0) / pixelsPerMeter, (shape.y ?? 0) / pixelsPerMeter),
        (shape.angle ?? 0) * DEG_TO_RAD,
      );
    case "circle":
      return new CircleShape(
        new Vec2((shape.x ?? 0) / pixelsPerMeter, (shape.y ?? 0) / pixelsPerMeter),
        (shape.radius ?? 0) / pixelsPerMeter,
      );
    case "polygon":
      return new PolygonShape((shape.points ?? []).map((p) => ({
        x: p.x / pixelsPerMeter,
        y: p.y / pixelsPerMeter,
      })));
    case "edge": {
      const [a, b] = shape.points ?? [];
      return new EdgeShape(
        new Vec2((a?.x ?? 0) / pixelsPerMeter, (a?.y ?? 0) / pixelsPerMeter),
        new Vec2((b?.x ?? 0) / pixelsPerMeter, (b?.y ?? 0) / pixelsPerMeter),
      );
    }
  }
}

function getRigidBody(body: Body): RigidBody | null {
  return ((body.getUserData() as BodyUserData | null)?.rigidBody) ?? null;
}

function dispatchContact(
  contact: Contact,
  callback: (body: RigidBody, other: RigidBody) => void,
): void {
  const a = getRigidBody(contact.getFixtureA().getBody());
  const b = getRigidBody(contact.getFixtureB().getBody());
  if (!a || !b) return;
  callback(a, b);
  callback(b, a);
}

function drawFixtureDebug(
  fixture: Fixture,
  transform: TransformValue,
  pixelsPerMeter: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  const shape = fixture.getShape();
  switch (shape.getType()) {
    case "circle": {
      const circleShape = shape as CircleShape;
      const center = toDebugPoint(
        Transform.mulVec2(transform, circleShape.getCenter()),
        pixelsPerMeter,
      );
      drawCircle(
        center.x,
        center.y,
        circleShape.getRadius() * pixelsPerMeter,
        color.r,
        color.g,
        color.b,
        color.a,
      );
      drawPoint(center.x, center.y, color.r, color.g, color.b, color.a);
      break;
    }
    case "edge": {
      const edgeShape = shape as EdgeShape;
      const a = toDebugPoint(Transform.mulVec2(transform, edgeShape.m_vertex1), pixelsPerMeter);
      const b = toDebugPoint(Transform.mulVec2(transform, edgeShape.m_vertex2), pixelsPerMeter);
      drawLine(a.x, a.y, b.x, b.y, color.r, color.g, color.b, color.a);
      break;
    }
    case "polygon": {
      const polygonShape = shape as PolygonShape;
      const points: DrawPoint[] = [];
      for (let i = 0; i < polygonShape.m_count; i++) {
        points.push(toDebugPoint(
          Transform.mulVec2(transform, polygonShape.m_vertices[i]),
          pixelsPerMeter,
        ));
      }
      drawPolyline(points, color.r, color.g, color.b, color.a, true);
      break;
    }
  }
}

function toDebugPoint(point: Vec2, pixelsPerMeter: number): DrawPoint {
  return {
    x: point.x * pixelsPerMeter,
    y: point.y * pixelsPerMeter,
  };
}
