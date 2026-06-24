import {
    Button,
    Label,
    Scene,
    SpineSkeleton,
    Sprite
} from "../engine";
import { instantiate, loadScene } from "../engine/core/instantiate";
import { DragonBones } from "../engine/dragonbones";
import {
    db_mecha_1004d_show,
    lilita_one_regularFont,
    sf_button,
    sp_spineboy_pma,
} from "./assets";
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

  onAnimationComplete(name?: string, count?: number) {
    console.log('onAnimationComplete', name, count)
  }

  __view() {
    const spriteComp1 = instantiate(Sprite, { spriteFrame: sf_button });
    this.root.addChild(spriteComp1.node);
    spriteComp1.node.x = 360;
    spriteComp1.node.y = 640;
    // spriteComp1.node.width = 220;
    // spriteComp1.node.height = 68;
    const Button1 = instantiate(Button, { onPress: this.onClick });
    spriteComp1.node.resolveComponent(Button1);
    const Label1 = instantiate(Label, { string: "PLAY", font: lilita_one_regularFont, size: 32, align: "center", verticalAlign: "middle" });
    spriteComp1.node.resolveComponent(Label1);
    const dragonBonesComp1 = instantiate(DragonBones, { data: db_mecha_1004d_show, animation: "idle", onAnimationComplete: this.onAnimationComplete.bind(this) });
    this.root.addChild(dragonBonesComp1.node);
    this.db = dragonBonesComp1;
    dragonBonesComp1.node.x = 460;
    dragonBonesComp1.node.y = 540;
    dragonBonesComp1.node.scale = .3;
    const spine1 = instantiate(SpineSkeleton, { data: sp_spineboy_pma, animation: "idle", onAnimationComplete: this.onAnimationComplete.bind(this) });
    this.root.addChild(spine1.node);
    spine1.node.x = 260;
    spine1.node.y = 840;
    spine1.node.scale = .3;
  }
}
