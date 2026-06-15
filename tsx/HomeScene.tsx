import {
  lilita_one_regularFont,
  sf_button,
} from "../src/assets";
import {
  Button,
  Label,
  Node,
  Scene,
  Sprite,
} from "../src/engine";
import { jsx, mount } from "./jsx-runtime";

export class HomeScene extends Scene {
  constructor() {
    super("Home");
  }

  onLoad(): void {
    const content = (
      <Node name="PlayButton" transform={{ x: 360, y: 640 }}>
        <Sprite spriteFrame={sf_button} width={220} height={68} />
        <Button
          onClick={this.onClick}
        />
        <Node name="PlayLabel">
          <Label
            string="PLAY"
            font={lilita_one_regularFont}
            size={32}
          />
        </Node>
      </Node>
    );

    this.root.addChild(mount(content));

    console.log("HomeScene loaded");
  }

  onClick = () => {
    console.log("clicked button");
  };

}
