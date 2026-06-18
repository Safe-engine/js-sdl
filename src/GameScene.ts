import {
  Button,
  instantiate,
  Label,
  loadScene,
  PhysicsWorld,
  Scene,
  Sprite
} from "../engine";
import {
  lilita_one_regularFont,
  sf_button,
} from "./assets";
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
    const physicsWorldComp1 = instantiate(PhysicsWorld, { debugDraw: { enabled: true, alpha: 190 } });
    this.root.addChild(physicsWorldComp1.node);
    const playerComp1 = instantiate(Player, {});
    this.root.addChild(playerComp1.node);
    this.player = playerComp1;
    playerComp1.node.x = 360;
    playerComp1.node.y = 1040;
    playerComp1.node.anchorX = 0.5;
    playerComp1.node.anchorY = 0.5;
    const labelComp2 = instantiate(Label, { string: "Tap to shoot", font: lilita_one_regularFont, size: 26 });
    this.root.addChild(labelComp2.node);
    labelComp2.node.x = 24;
    labelComp2.node.y = 24;
    labelComp2.node.width = 240;
    labelComp2.node.height = 40;
    labelComp2.node.anchorX = 0;
    labelComp2.node.anchorY = 0;
    const spriteComp2 = instantiate(Sprite, { spriteFrame: sf_button });
    this.root.addChild(spriteComp2.node);
    spriteComp2.node.x = 360;
    spriteComp2.node.y = 240;
    spriteComp2.node.width = 220;
    spriteComp2.node.height = 68;
    const buttonComp2 = instantiate(Button, { onPress: this.onClick });
    spriteComp2.node.resolveComponent(buttonComp2);
    const labelComp3 = instantiate(Label, { string: "PLAY", font: lilita_one_regularFont, size: 32, align: "center", verticalAlign: "middle" });
    spriteComp2.node.resolveComponent(labelComp3);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
