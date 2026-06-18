import { Component, type Constructor } from "../core/Component";
import type { Node } from "../core/Node";

export type BodyType = "static" | "kinematic" | "dynamic" | 0 | 1 | 2;
export type ContactCallback<TRigidBody, TContactValue = unknown> = (
  other: TRigidBody,
  contact?: TContactValue,
) => void;


export interface PhysicsShapeDef {
  kind: "box" | "circle" | "polygon" | "edge";
  width?: Float;
  height?: Float;
  radius?: Float;
  x?: Float;
  y?: Float;
  angle?: Float;
  points?: Vec2[];
}

export interface RigidBodyProps<
  TRigidBody = PhysicsRigidBodyComponent<any, any, any>,
  TShape = PhysicsShapeDef,
  TContactValue = unknown,
  TBodyType = BodyType,
> {
  type?: TBodyType;
  density?: Float;
  restitution?: Float;
  friction?: Float;
  gravityScale?: Float;
  isSensor?: boolean;
  tag?: number;
  onBeginContact?: (other: TRigidBody) => void;
  onEndContact?: (other: TRigidBody) => void;
  onPreSolve?: ContactCallback<TRigidBody, TContactValue>;
  onPostSolve?: ContactCallback<TRigidBody, TContactValue>;
  shapes: TShape | TShape[];
}

export interface PhysicsWorldProps {
  gravity?: Vec2;
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
  color?: number;
}

export const DEFAULT_PIXELS_PER_METER = 32;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

type PhysicsWorldConstructor<T extends PhysicsWorldComponent = PhysicsWorldComponent> = Constructor<T>;

const activePhysicsWorlds = new WeakMap<PhysicsWorldConstructor, PhysicsWorldComponent>();

export function box(width: Float, height: Float, x = 0, y = 0, angle = 0): PhysicsShapeDef {
  return { kind: "box", width, height, x, y, angle };
}

export function circle(radius: Float, x = 0, y = 0): PhysicsShapeDef {
  return { kind: "circle", radius, x, y };
}

export function polygon(points: Vec2[]): PhysicsShapeDef {
  return { kind: "polygon", points };
}

export function edge(a: Vec2, b: Vec2): PhysicsShapeDef {
  return { kind: "edge", points: [a, b] };
}

export function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export function debugColor(hex: number, alpha: number): { r: number; g: number; b: number; a: number } {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
    a: alpha,
  };
}

export abstract class PhysicsWorldComponent<
  TProps extends PhysicsWorldProps = PhysicsWorldProps,
> extends Component<TProps> {
  pixelsPerMeter = DEFAULT_PIXELS_PER_METER;
  velocityIterations = 8;
  positionIterations = 3;
  fixedTimeStep = 1 / 60;
  maxSubSteps = 5;
  private accumulator = 0;

  onAwake(): void {
    activePhysicsWorlds.set(this.constructor as PhysicsWorldConstructor, this);
    this.configurePhysicsWorld();
  }

  onDestroy(): void {
    if (activePhysicsWorlds.get(this.constructor as PhysicsWorldConstructor) === this) {
      activePhysicsWorlds.delete(this.constructor as PhysicsWorldConstructor);
    }
  }

  onUpdate(dt: number): void {
    if (this.fixedTimeStep <= 0) {
      this.stepPhysics(dt);
      return;
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.fixedTimeStep && steps < this.maxSubSteps) {
      this.stepPhysics(this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0;
  }

  toWorldPointValue(x: number, y: number): Vec2 {
    return { x: x / this.pixelsPerMeter, y: y / this.pixelsPerMeter };
  }

  toNodePointValue(point: Vec2): Vec2 {
    return { x: point.x * this.pixelsPerMeter, y: point.y * this.pixelsPerMeter };
  }

  protected get debugDrawEnabled(): boolean {
    const debugDraw = this.props.debugDraw;
    return typeof debugDraw === "boolean" ? debugDraw : debugDraw?.enabled ?? false;
  }

  protected get debugDrawAlpha(): number {
    const debugDraw = this.props.debugDraw;
    return typeof debugDraw === "object" ? debugDraw.alpha ?? 180 : 180;
  }

  protected get debugDrawColor(): number {
    const debugDraw = this.props.debugDraw;
    return typeof debugDraw === "object" ? debugDraw.color ?? 0x6ee7ff : 0x6ee7ff;
  }

  abstract createBody(rigidBody: any): any;
  abstract destroyBody(body: any): void;

  protected abstract stepPhysics(dt: number): void;

  private configurePhysicsWorld(): void {
    const props = this.props;
    this.pixelsPerMeter = props.pixelsPerMeter ?? this.pixelsPerMeter;
    this.velocityIterations = props.velocityIterations ?? this.velocityIterations;
    this.positionIterations = props.positionIterations ?? this.positionIterations;
    this.fixedTimeStep = props.fixedTimeStep ?? this.fixedTimeStep;
    this.maxSubSteps = props.maxSubSteps ?? this.maxSubSteps;
  }
}

export abstract class PhysicsRigidBodyComponent<
  TWorld extends PhysicsWorldComponent,
  TBody,
  TProps extends RigidBodyProps<any, any, any>,
> extends Component<TProps> {
  body: TBody | null = null;
  world: TWorld | null = null;

  get tag(): number | undefined {
    return this.props.tag;
  }

  onStart(): void {
    this.ensureBody();
  }

  onDestroy(): void {
    if (this.body !== null && this.world) {
      this.world.destroyBody(this.body);
    }
    this.body = null;
    this.world = null;
  }

  protected abstract getWorldConstructor(): PhysicsWorldConstructor<TWorld>;

  private ensureBody(): void {
    if (this.body !== null) return;
    this.world = findPhysicsWorld(this.node, this.getWorldConstructor());
    if (!this.world) {
      throw new Error("RigidBody requires a PhysicsWorld component on this node or an ancestor.");
    }
    this.body = this.world.createBody(this) as TBody;
  }
}

export function findPhysicsWorld<T extends PhysicsWorldComponent>(
  node: Node | null,
  worldType: PhysicsWorldConstructor<T>,
): T | null {
  for (let current = node; current; current = current.parent) {
    const world = current.getComponent(worldType);
    if (world) return world;
  }
  return (activePhysicsWorlds.get(worldType) as T | undefined) ?? null;
}
