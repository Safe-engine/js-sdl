import {
  lilita_one_regularFont,
} from "../src/assets";
import {
  Label,
  instantiate,
  Scene
} from "../src/engine";
import { Bullet } from "./Bullet";
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

  __view() {
    <Player $ref={this.player} node={{ x: 360, y: 1040, anchorX: 0.5, anchorY: 0.5 }}>
    </Player>;
    <Label node={{ x: 24, y: 24 }}
      string="Tap to shoot"
      font={lilita_one_regularFont}
      size={26}
    />
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
