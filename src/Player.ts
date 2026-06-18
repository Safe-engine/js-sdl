import { box, ComponentX, instantiate, RigidBody, Sprite } from "../engine";
import { sf_player } from "./assets";

export class Player extends ComponentX {
  speed = 420;

  __view() {
    const spriteComp3 = instantiate(Sprite, { spriteFrame: sf_player });
    const playerComp2 = spriteComp3.addComponent(this);
    const rigidBodyComp1 = instantiate(RigidBody, { type: "dynamic", shapes: box(100, 200) });
    spriteComp3.node.resolveComponent(rigidBodyComp1);
    return playerComp2;
  }
}
