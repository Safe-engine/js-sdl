import {
  lilita_one_regularFont,
} from "../src/assets";
import {
  Label,
  Node,
  Scene,
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

  constructor() {
    super("Game");
  }

  __view(): Node {
    return (
      <Node name="GameLayer">
        <Node name="Player" transform={{ x: 360, y: 1040, anchorX: 0.5, anchorY: 0.5 }}>
          <Player ref={this.player} />
        </Node>
        <Node name="Hud" transform={{ x: 24, y: 24 }}>
          <Label
            string="Tap to shoot"
            font={lilita_one_regularFont}
            size={26}
          />
        </Node>
      </Node>
    );
  }

  onLoad(): void {
    console.log("GameScene loaded");
  }

  onUpdate(dt: number): void {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      const node = bullet.bullet.node!;
      node.transform.y -= bullet.bullet.speed * dt;

      if (node.transform.y < -64) {
        node.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  onTouchStart(x: number, _y: number): void {
    if (!this.player) return;

    this.player.node!.transform.x = clamp(x, 48, 672);
    this.shoot();
  }

  private shoot(): void {
    if (!this.player || this.shootCooldown > 0) return;

    const bullet = (
      <Node name="Bullet" transform={{
        x: this.player.node!.transform.x,
        y: this.player.node!.transform.y - 56,
        anchorX: 0.5,
        anchorY: 0.5,
      }}>
        <Bullet ref={(bullet) => {
          this.bullets.push({ bullet });
        }} />
      </Node>
    );

    this.root.addChild(bullet);
    this.shootCooldown = 0.12;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
