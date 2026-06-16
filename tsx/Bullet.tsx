import { sf_bullet } from "../src/assets";
import { Component, Node, Sprite } from "../src/engine";

export class Bullet extends Component {
  speed = 720;

  __view(): Node {
    return (
      <Node name="BulletView">
        <Sprite spriteFrame={sf_bullet} width={28} height={42} />
      </Node>
    );
  }
}
