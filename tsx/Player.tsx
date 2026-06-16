import { sf_player } from "../src/assets";
import { Component, Sprite } from "../src/engine";

export class Player extends Component {
  speed = 420;

  __view() {
    <Sprite spriteFrame={sf_player} />
  }
}
