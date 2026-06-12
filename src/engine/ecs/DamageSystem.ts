import { System } from "entityx-ts";
import { HealthComponent, DamageComponent } from "./ECSComponents";

/**
 * System: entities with HealthComponent + DamageComponent.
 * Applies damage once, then removes DamageComponent.
 */
export class DamageSystem implements System {
  update(entities: any, _events: any, _dt: number): void {
    const list = entities.entities_with_components(
      HealthComponent,
      DamageComponent
    );
    for (const e of list) {
      const hp = e.getComponent(HealthComponent) as HealthComponent;
      const dmg = e.getComponent(DamageComponent) as DamageComponent;
      hp.current = Math.max(0, hp.current - dmg.amount);

      // remove damage so it's applied once
      e.remove(DamageComponent);
    }
  }
}
