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
  private playButton: Button | null = null;

  constructor() {
    super("Home");
  }

  onLoad(): void {
    const content = (
      <Node name="PlayButton" transform={{ x: 360, y: 640 }}>
        <Sprite spriteFrame={sf_button} width={220} height={68} />
        <Button
          ref={(button) => {
            this.playButton = button as Button;
          }}
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

  onTouchStart(x: number, y: number): void {
    this.playButton?.handleTouchStart(x, y);
  }

  onTouchEnd(x: number, y: number): void {
    this.playButton?.handleTouchEnd(x, y);
  }
}
