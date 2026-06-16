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
import { loadScene } from "../src/engine/core/instantiate";
import { GameScene } from "./GameScene";

export class HomeScene extends Scene {
  constructor() {
    super("Home");
  }

  onLoad(): void {
    console.log("HomeScene loaded");
  }

  onClick = () => {
    console.log("clicked button");
    loadScene(GameScene);
  };

  __view() {
    <Sprite spriteFrame={sf_button} node={{ x: 360, y: 640, width: 220, height: 68 }}>
      <Button onPress={this.onClick} />
      <Label
        string="PLAY"
        font={lilita_one_regularFont}
        size={32}
      />
    </Sprite>
  }
}
