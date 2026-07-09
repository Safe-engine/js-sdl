declare module 'box2d' {
  export {
    Body,
    BoxShape,
    CircleShape,
    Contact,
    ContactImpulse,
    EdgeShape,
    Fixture,
    Manifold,
    PolygonShape,
    Shape,
    Transform,
    TransformValue,
    Vec2,
  } from 'planck'

  export type BodyType = 0 | 1 | 2

  type BodyDef = Omit<import('planck').BodyDef, 'type'> & {
    type?: BodyType | import('planck').BodyType
  }

  export type World = import('planck').World & {
    createBody(def?: BodyDef): import('planck').Body
    createBody(position: import('planck').Vec2Value, angle?: number): import('planck').Body
  }

  export const World: {
    new(def?: import('planck').WorldDef | import('planck').Vec2Value): World
  }

  export interface BodyTransform extends Vec2 {
    angle: number
  }
  export interface ContactEvents {
    begin: Array<[number, number]>
    end: Array<[number, number]>
  }
  export type DebugPrimitive
    = | { type: 'line', x1: number, y1: number, x2: number, y2: number, color: number }
      | { type: 'circle', x: number, y: number, radius: number, color: number, fill?: boolean }
      | { type: 'polygon', points: Vec2[], color: number, fill?: boolean }
      | { type: 'point', x: number, y: number, size: number, color: number }

  export function createWorld(gravity?: Vec2): number
  export function destroyWorld(world: number): void
  export function stepWorld(world: number, timeStep: number, subStepCount?: number): void
  export function setGravity(world: number, gravity: Vec2): void
  export function createBody(
    world: number,
    type: BodyType,
    position: Vec2,
    angle: number,
    gravityScale: number,
    userData: number,
  ): number
  export function destroyBody(body: number): void
  export function createBoxShape(
    body: number,
    halfWidth: number,
    halfHeight: number,
    center: Vec2,
    angle: number,
    density?: number,
    friction?: number,
    restitution?: number,
    isSensor?: boolean,
  ): number
  export function createCircleShape(
    body: number,
    radius: number,
    center: Vec2,
    density?: number,
    friction?: number,
    restitution?: number,
    isSensor?: boolean,
  ): number
  export function createPolygonShape(
    body: number,
    points: Vec2[],
    density?: number,
    friction?: number,
    restitution?: number,
    isSensor?: boolean,
  ): number
  export function createSegmentShape(
    body: number,
    a: Vec2,
    b: Vec2,
    density?: number,
    friction?: number,
    restitution?: number,
    isSensor?: boolean,
  ): number
  export function getBodyTransform(body: number): BodyTransform | null
  export function setBodyTransform(body: number, position: Vec2, angle: number): void
  export function setLinearVelocity(body: number, velocity: Vec2): void
  export function applyForceToCenter(body: number, force: Vec2): void
  export function applyLinearImpulseToCenter(body: number, impulse: Vec2): void
  export function getContactEvents(world: number): ContactEvents
  export function getDebugDraw(world: number, pixelsPerMeter: number): DebugPrimitive[]
}
