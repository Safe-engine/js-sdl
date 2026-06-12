import { World } from "entityx-ts";
import { Transform } from "../core/Transform";
import { SpriteRenderer } from "../components/SpriteRenderer";

export class ECSManager {
  world: World;

  constructor() {
    this.world = new World();
  }

  createEntity() {
    return this.world.entities.create();
  }

  destroyEntity(id: number): void {
    this.world.entities.destroy(id);
  }

  /** Query entities with specific components. */
  query(...components: any[]): any[] {
    return this.world.entities.entities_with_components(...components);
  }

  /** Register system class. */
  addSystem(sys: any): void {
    this.world.systems.add(sys);
  }

  /** Update all systems (called per frame). */
  update(dt: number): void {
    const sysMap = this.world.systemsMap;
    for (const name in sysMap) {
      const sys = sysMap[name];
      if (sys.update) {
        sys.update(this.world.entities, this.world.events, dt);
      }
    }
  }
}
