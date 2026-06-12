import { World, Entity } from "entityx-ts";

export class HealthComponent {
  current = 100;
  max = 100;
  constructor(max: number = 100) {
    this.max = max;
    this.current = max;
  }
}

export class VelocityComponent {
  x = 0;
  y = 0;
}

export class DamageComponent {
  amount = 10;
}
