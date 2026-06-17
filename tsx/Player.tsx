import { sf_player } from "../src/assets";
import { Component, Sprite } from "../src/engine";
import { box, RigidBody } from "./planck";

export class Player extends Component {
  speed = 420;

  __view() {
    <Sprite spriteFrame={sf_player} >
      <RigidBody type="dynamic" shapes={box(100,200)}/>
    </Sprite>
  }
}
