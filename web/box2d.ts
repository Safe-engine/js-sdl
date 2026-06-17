import * as planck from "planck";

export type BodyType = 0 | 1 | 2;

export interface Vec2Value {
  x: number;
  y: number;
}

export interface BodyTransform extends Vec2Value {
  angle: number;
}

export interface ContactEvents {
  begin: Array<[number, number]>;
  end: Array<[number, number]>;
}

export type DebugPrimitive =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; color: number }
  | { type: "circle"; x: number; y: number; radius: number; color: number; fill?: boolean }
  | { type: "polygon"; points: Vec2Value[]; color: number; fill?: boolean }
  | { type: "point"; x: number; y: number; size: number; color: number };

interface WorldState {
  world: planck.World;
  begin: Array<[number, number]>;
  end: Array<[number, number]>;
}

const DEBUG_COLOR = 0x6ee7ff;

let nextWorldId = 1;
let nextBodyId = 1;
let nextShapeId = 1;

const worlds = new Map<number, WorldState>();
const bodies = new Map<number, planck.Body>();
const bodyIds = new WeakMap<planck.Body, number>();
const shapes = new Map<number, planck.Fixture>();

export function createWorld(gravity: Vec2Value = { x: 0, y: 9.8 }): number {
  const id = nextWorldId++;
  const state: WorldState = {
    world: new planck.World(gravity),
    begin: [],
    end: [],
  };

  state.world.on("begin-contact", (contact) => {
    const pair = contactPair(contact);
    if (pair) state.begin.push(pair);
  });
  state.world.on("end-contact", (contact) => {
    const pair = contactPair(contact);
    if (pair) state.end.push(pair);
  });

  worlds.set(id, state);
  return id;
}

export function destroyWorld(worldId: number): void {
  const state = worlds.get(worldId);
  if (!state) return;

  for (let body = state.world.getBodyList(); body; body = body.getNext()) {
    const bodyId = bodyIds.get(body);
    if (bodyId !== undefined) bodies.delete(bodyId);
  }
  worlds.delete(worldId);
}

export function stepWorld(worldId: number, timeStep: number, subStepCount = 8): void {
  worlds.get(worldId)?.world.step(timeStep, subStepCount, 3);
}

export function setGravity(worldId: number, gravity: Vec2Value): void {
  worlds.get(worldId)?.world.setGravity(gravity);
}

export function createBody(
  worldId: number,
  type: BodyType,
  position: Vec2Value,
  angle: number,
  gravityScale: number,
  userData: number,
): number {
  const state = worlds.get(worldId);
  if (!state) return 0;

  const id = nextBodyId++;
  const body = state.world.createBody({
    type: toPlanckBodyType(type),
    position,
    angle,
    gravityScale,
    userData,
  });
  bodies.set(id, body);
  bodyIds.set(body, id);
  return id;
}

export function destroyBody(bodyId: number): void {
  const body = bodies.get(bodyId);
  if (!body) return;
  body.getWorld().destroyBody(body);
  bodies.delete(bodyId);
}

export function createBoxShape(
  bodyId: number,
  halfWidth: number,
  halfHeight: number,
  center: Vec2Value,
  angle: number,
  density = 1,
  friction = 0.2,
  restitution = 0,
  isSensor = false,
): number {
  return createFixture(
    bodyId,
    new planck.BoxShape(halfWidth, halfHeight, center, angle),
    density,
    friction,
    restitution,
    isSensor,
  );
}

export function createCircleShape(
  bodyId: number,
  radius: number,
  center: Vec2Value,
  density = 1,
  friction = 0.2,
  restitution = 0,
  isSensor = false,
): number {
  return createFixture(
    bodyId,
    new planck.CircleShape(center, radius),
    density,
    friction,
    restitution,
    isSensor,
  );
}

export function createPolygonShape(
  bodyId: number,
  points: Vec2Value[],
  density = 1,
  friction = 0.2,
  restitution = 0,
  isSensor = false,
): number {
  return createFixture(
    bodyId,
    new planck.PolygonShape(points),
    density,
    friction,
    restitution,
    isSensor,
  );
}

export function createSegmentShape(
  bodyId: number,
  a: Vec2Value,
  b: Vec2Value,
  density = 1,
  friction = 0.2,
  restitution = 0,
  isSensor = false,
): number {
  return createFixture(
    bodyId,
    new planck.EdgeShape(a, b),
    density,
    friction,
    restitution,
    isSensor,
  );
}

export function getBodyTransform(bodyId: number): BodyTransform | null {
  const body = bodies.get(bodyId);
  if (!body) return null;
  const position = body.getPosition();
  return { x: position.x, y: position.y, angle: body.getAngle() };
}

export function setBodyTransform(bodyId: number, position: Vec2Value, angle: number): void {
  bodies.get(bodyId)?.setTransform(position, angle);
}

export function setLinearVelocity(bodyId: number, velocity: Vec2Value): void {
  bodies.get(bodyId)?.setLinearVelocity(velocity);
}

export function applyForceToCenter(bodyId: number, force: Vec2Value): void {
  bodies.get(bodyId)?.applyForceToCenter(force, true);
}

export function applyLinearImpulseToCenter(bodyId: number, impulse: Vec2Value): void {
  const body = bodies.get(bodyId);
  if (!body) return;
  body.applyLinearImpulse(impulse, body.getWorldCenter(), true);
}

export function getContactEvents(worldId: number): ContactEvents {
  const state = worlds.get(worldId);
  if (!state) return { begin: [], end: [] };

  const events = {
    begin: state.begin,
    end: state.end,
  };
  state.begin = [];
  state.end = [];
  return events;
}

export function getDebugDraw(worldId: number, pixelsPerMeter: number): DebugPrimitive[] {
  const world = worlds.get(worldId)?.world;
  if (!world) return [];

  const primitives: DebugPrimitive[] = [];
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    const transform = body.getTransform();
    for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
      appendFixtureDebug(primitives, fixture, transform, pixelsPerMeter);
    }
  }
  return primitives;
}

function createFixture(
  bodyId: number,
  shape: planck.Shape,
  density: number,
  friction: number,
  restitution: number,
  isSensor: boolean,
): number {
  const body = bodies.get(bodyId);
  if (!body) return 0;

  const id = nextShapeId++;
  const fixture = body.createFixture(shape, {
    density,
    friction,
    restitution,
    isSensor,
  });
  shapes.set(id, fixture);
  return id;
}

function toPlanckBodyType(type: BodyType): planck.BodyType {
  if (type === 0) return "static";
  if (type === 1) return "kinematic";
  return "dynamic";
}

function contactPair(contact: planck.Contact): [number, number] | null {
  const a = contact.getFixtureA().getBody().getUserData();
  const b = contact.getFixtureB().getBody().getUserData();
  return typeof a === "number" && typeof b === "number" ? [a, b] : null;
}

function appendFixtureDebug(
  primitives: DebugPrimitive[],
  fixture: planck.Fixture,
  transform: planck.TransformValue,
  pixelsPerMeter: number,
): void {
  const shape = fixture.getShape();
  switch (shape.getType()) {
    case "circle": {
      const circle = shape as planck.CircleShape;
      const center = planck.Transform.mulVec2(transform, circle.getCenter());
      primitives.push({
        type: "circle",
        x: center.x * pixelsPerMeter,
        y: center.y * pixelsPerMeter,
        radius: circle.getRadius() * pixelsPerMeter,
        color: DEBUG_COLOR,
      });
      break;
    }
    case "edge": {
      const edge = shape as planck.EdgeShape;
      const a = planck.Transform.mulVec2(transform, edge.m_vertex1);
      const b = planck.Transform.mulVec2(transform, edge.m_vertex2);
      primitives.push({
        type: "line",
        x1: a.x * pixelsPerMeter,
        y1: a.y * pixelsPerMeter,
        x2: b.x * pixelsPerMeter,
        y2: b.y * pixelsPerMeter,
        color: DEBUG_COLOR,
      });
      break;
    }
    case "polygon": {
      const polygon = shape as planck.PolygonShape;
      const points: Vec2Value[] = [];
      for (let i = 0; i < polygon.m_count; i++) {
        const point = planck.Transform.mulVec2(transform, polygon.m_vertices[i]);
        points.push({ x: point.x * pixelsPerMeter, y: point.y * pixelsPerMeter });
      }
      primitives.push({ type: "polygon", points, color: DEBUG_COLOR });
      break;
    }
  }
}
