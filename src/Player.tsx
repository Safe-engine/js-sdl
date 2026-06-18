import { box, Component, RigidBody, Sprite } from "../engine";
import { sf_player } from "./assets";

export class Player extends Component {
  speed = 420;

  __view() {
    <Sprite spriteFrame={sf_player} >
      <RigidBody type="dynamic" shapes={box(100,200)}/>
    </Sprite>
  }
}
