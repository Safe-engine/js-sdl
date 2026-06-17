import {
  db_mecha_1004d_show,
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
import { DragonBones } from "./dragonbones";
import { GameScene } from "./GameScene";

export class HomeScene extends Scene {
  db: DragonBones

  onLoad(): void {
    console.log("HomeScene loaded", this.db);
  }

  onClick = () => {
    console.log("clicked button");
    loadScene(GameScene);
  };

  onAnimationComplete(name: string, count: number) {
    console.log('onAnimationComplete', name, count)
  }

  __view() {
    <Sprite spriteFrame={sf_button} node={{ x: 360, y: 640, width: 220, height: 68 }}>
      <Button onPress={this.onClick} />
      <Label
        string="PLAY"
        font={lilita_one_regularFont}
        size={32}
        align="center"
        verticalAlign="middle"
      />
    </Sprite>;
    <DragonBones $ref={this.db} node={{ x: 460, y: 1240 }} data={db_mecha_1004d_show} animation="idle" onAnimationComplete={this.onAnimationComplete} />
  }
}
