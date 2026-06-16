import {
  lilita_one_regularFont,
  sf_button,
} from "../src/assets";
import {
  Button,
  Label,
  Scene,
  Sprite
} from "../src/engine";

export class HomeScene extends Scene {
  constructor() {
    super("Home");
  }

  onLoad(): void {
    console.log("HomeScene loaded");
  }

  onClick = () => {
    console.log("clicked button");
  };

  __view() {
    <Sprite spriteFrame={sf_button} node={{ x: 360, y: 640, width: 220, height: 68 }}>
      <Button onClick={this.onClick} />
    </Sprite>;
    <Label
      string="PLAY"
      font={lilita_one_regularFont}
      size={32}
    />
  }
}
