import { describe, expect, mock, test } from "bun:test";
import { Node } from "../engine/core/Node";

mock.module("sdl3", () => ({
  drawCircle: () => {},
  drawLine: () => {},
  drawPoint: () => {},
  drawPolyline: () => {},
}));

const {
  PhysicsWorld,
  RigidBody,
  box,
  circle,
} = await import("../engine/physics");

function start(root: Node): void {
  root._startTree();
}

describe("planck physics", () => {
  test("steps rigid bodies and syncs node transforms", () => {
    const root = new Node("root");
    root.addComponent(PhysicsWorld, {
      gravity: { x: 0, y: 10 },
      pixelsPerMeter: 10,
      fixedTimeStep: 0,
    });

    const node = new Node("body");
    node.setPosition(0, 0);
    node.addComponent(RigidBody, {
      type: "dynamic",
      shapes: box(10, 10),
    });
    root.addChild(node);

    start(root);
    root._updateTree(1);

    expect(node.y).toBeGreaterThan(0);
  });

  test("creates fixtures from props", () => {
    const root = new Node("root");
    root.addComponent(PhysicsWorld, { pixelsPerMeter: 20 });

    const node = new Node("sensor");
    const rigidBody = node.addComponent(RigidBody, {
      type: "static",
      density: 3,
      restitution: 0.5,
      friction: 0.1,
      isSensor: true,
      tag: 7,
      shapes: [box(40, 20), circle(10, 10, 0)],
    });
    root.addChild(node);

    start(root);

    const firstFixture = rigidBody.body!.getFixtureList()!;
    expect(rigidBody.tag).toBe(7);
    expect(firstFixture.isSensor()).toBe(true);
    expect(firstFixture.getDensity()).toBe(3);
    expect(firstFixture.getRestitution()).toBe(0.5);
    expect(firstFixture.getFriction()).toBe(0.1);
    expect(firstFixture.getNext()).not.toBeNull();
  });

  test("allows scene-level physics worlds as siblings", () => {
    const root = new Node("root");
    const worldNode = new Node("world");
    worldNode.addComponent(PhysicsWorld, { gravity: { x: 0, y: 0 } });
    root.addChild(worldNode);

    const playerNode = new Node("player");
    const rigidBody = playerNode.addComponent(RigidBody, {
      type: "kinematic",
      shapes: box(16, 16),
    });
    root.addChild(playerNode);

    start(root);

    expect(rigidBody.world).toBe(worldNode.getComponent(PhysicsWorld));
    expect(rigidBody.body).not.toBeNull();
  });

  test("dispatches contact callbacks with the other rigid body", () => {
    let groundHit: RigidBody | null = null;
    let ballHit: RigidBody | null = null;

    const root = new Node("root");
    root.addComponent(PhysicsWorld, {
      gravity: { x: 0, y: 10 },
      pixelsPerMeter: 10,
      fixedTimeStep: 1 / 60,
    });

    const ground = new Node("ground");
    ground.setPosition(0, 50);
    const groundBody = ground.addComponent(RigidBody, {
      type: "static",
      shapes: box(200, 10),
      onBeginContact: (other) => {
        groundHit = other;
      },
    });

    const ball = new Node("ball");
    ball.setPosition(0, 0);
    const ballBody = ball.addComponent(RigidBody, {
      type: "dynamic",
      shapes: circle(5),
      onBeginContact: (other) => {
        ballHit = other;
      },
    });

    root.addChild(ground);
    root.addChild(ball);
    start(root);

    for (let i = 0; i < 120 && (!groundHit || !ballHit); i++) {
      root._updateTree(1 / 60);
    }

    expect(groundHit).toBe(ballBody);
    expect(ballHit).toBe(groundBody);
  });
});
