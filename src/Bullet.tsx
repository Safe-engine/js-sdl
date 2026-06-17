import { Component, Sprite } from "../engine";
import { sf_bullet } from "./assets";

export class Bullet extends Component {
  speed = 720;

  __view() {
    <Sprite spriteFrame={sf_bullet} node={{
      width: 28, height: 42,
      anchorX: 0.5,
      anchorY: 0.5,
    }} />
  }
}
