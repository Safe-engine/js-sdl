import { PhysicsWorld } from "#engine/physics";
import {
  lilita_one_regularFont,
  sf_button,
} from "../src/assets";
import {
  Button,
  instantiate,
  Label,
  Scene,
  Sprite
} from "../src/engine";
import { loadScene } from "../src/engine/core/instantiate";
import { Bullet } from "./Bullet";
import { HomeScene } from "./HomeScene";
import { Player } from "./Player";

interface BulletState {
  bullet: Bullet;
}

export class GameScene extends Scene {
  private player: Player | null = null;
  private bullets: BulletState[] = [];
  private shootCooldown = 0;

  onLoad(): void {
    console.log("GameScene loaded");
  }

  onUpdate(dt: number): void {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      const node = bullet.bullet.node!;
      node.y -= bullet.bullet.speed * dt;

      if (node.y < -64) {
        node.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  onTouchStart(x: number, _y: number): void {
    if (!this.player) return;

    this.player.node.x = clamp(x, 48, 672);
    this.shoot();
  }

  private shoot(): void {
    if (!this.player || this.shootCooldown > 0) return;

    const bullet = instantiate(Bullet)
    bullet.node.x = this.player.node.x
    bullet.node.y = this.player.node.y - 56
    this.bullets.push({ bullet });

    this.root.addChild(bullet.node);
    this.shootCooldown = 0.12;
  }

  onClick = () => {
    console.log("clicked button");
    loadScene(HomeScene);
  };

  __view() {
    <PhysicsWorld debugDraw={{ enabled: true, alpha: 190 }} />;
    <Player $ref={this.player} node={{ x: 360, y: 1040, anchorX: 0.5, anchorY: 0.5 }}>
    </Player>;
    <Label node={{ x: 24, y: 24, width: 240, height: 40, anchorX: 0, anchorY: 0 }}
      string="Tap to shoot"
      font={lilita_one_regularFont}
      size={26}
    />;
    <Sprite spriteFrame={sf_button} node={{ x: 360, y: 240, width: 220, height: 68 }}>
      <Button onPress={this.onClick} />
      <Label
        string="PLAY"
        font={lilita_one_regularFont}
        size={32}
        align="center"
        verticalAlign="middle"
      />
    </Sprite>;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
