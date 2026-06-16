import { sf_player } from "../src/assets";
import { Component, Node, Sprite } from "../src/engine";

export class Player extends Component {
  speed = 420;

  __view(): Node {
    return (
      <Node name="PlayerView">
        <Sprite spriteFrame={sf_player} width={72} height={72} />
      </Node>
    );
  }
}
