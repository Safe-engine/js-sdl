/**
 * Main entry — Cocos Creator-like Scene + Component + ECS demo.
 *
 * Scene graph:
 *   Scene
 *     ├── Node "Player"
 *     │     ├── Transform     (300, 300)
 *     │     ├── SpriteRenderer (player.png)
 *     │     └── PlayerController (custom movement script)
 *     │
 *     ├── Node "Enemy"
 *     │     ├── Transform     (600, 200)
 *     │     ├── SpriteRenderer (bullet.png, tinted red)
 *     │     └── EnemyAI (script)
 *     │
 *     ├── Node "HUD"
 *     │     └── LabelRenderer (FPS counter)
 *     │
 *     └── ECS World
 *           ├── VelocityComponent
 *           ├── HealthComponent
 *           ├── MovementSystem
 *           └── DamageSystem
 */

import {
  Engine,
  Scene,
  Node,
  Component,
  SpriteRenderer,
  LabelRenderer,
} from "./engine";

/* ── Custom Components ─────────────────────────────── */

class PlayerController extends Component {
  speed = 180;
  dir = 1;

  onUpdate(dt: number): void {
    const t = this.node!.transform;
    t.x += this.speed * this.dir * dt;
    if (t.x > 700) this.dir = -1;
    if (t.x < 100) this.dir = 1;
  }
}

class EnemyAI extends Component {
  lifetime = 0;

  onStart(): void {
    const sr = this.node!.getComponent(SpriteRenderer)!;
    sr.width = 48;
    sr.height = 48;
  }

  onUpdate(dt: number): void {
    this.lifetime += dt;
    const t = this.node!.transform;
    t.y += Math.sin(this.lifetime * 2) * 60 * dt;
    t.x -= 40 * dt;
    if (t.x < -64) t.x = 800;
  }
}

/* ── Scene ─────────────────────────────────────────── */

class GameScene extends Scene {
  onLoad(): void {
    // Player
    const player = new Node("Player");
    player.transform.setPosition(300, 350);
    const spr = player.addComponent(new SpriteRenderer());
    spr.texturePath = "res/Texture/player.png";
    spr.width = 64;
    spr.height = 64;
    player.addComponent(new PlayerController());
    this.root.addChild(player);

    // Enemy
    const enemy = new Node("Enemy");
    enemy.transform.setPosition(600, 250);
    const espr = enemy.addComponent(new SpriteRenderer());
    espr.texturePath = "res/Texture/bullet.png";
    espr.width = 64;
    espr.height = 64;
    enemy.addComponent(new EnemyAI());
    this.root.addChild(enemy);

    // HUD label
    const hud = new Node("HUD");
    hud.transform.setPosition(20, 20);
    const label = hud.addComponent(new LabelRenderer());
    label.setFont("res/Font/LilitaOne-Regular.ttf", 20);
    label.setText("SDL3 + QuickJS + TS (Hot Reload Enabled)");
    this.root.addChild(hud);

    console.log("GameScene loaded — Player + Enemy + ECS ready");
  }

  onUpdate(_dt: number): void {
    // push ECS damage events, spawn bullets, etc.
  }
}

/* ── Bootstrap ─────────────────────────────────────── */

Engine.start("Gemma4 Engine — SDL3 + QuickJS + TS", 800, 600);
Engine.scene = new GameScene();
