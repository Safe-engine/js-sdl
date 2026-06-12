import { System } from "entityx-ts";
import { VelocityComponent } from "./ECSComponents";
import { Transform } from "../core/Transform";

/**
 * Bridges ECS Velocity → scene Node Transform.
 * Expects entity to have a NodeComponent that holds a Transform reference.
 */
export class NodeComponent {
  constructor(public transform: Transform) {}
}

/**
 * System: entities with VelocityComponent + NodeComponent
 * → updates Transform position by velocity * dt.
 */
export class MovementSystem implements System {
  update(entities: any, _events: any, dt: number): void {
    const list = entities.entities_with_components(
      VelocityComponent,
      NodeComponent
    );
    for (const e of list) {
      const vel = e.getComponent(VelocityComponent) as VelocityComponent;
      const nc = e.getComponent(NodeComponent) as NodeComponent;
      nc.transform.x += vel.x * dt;
      nc.transform.y += vel.y * dt;
    }
  }
}
