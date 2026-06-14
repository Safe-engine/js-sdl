import {
  Engine,
  Scene,
  Node,
  Component,
  Sprite,
  Label,
  Button,
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
    const sr = this.node!.getComponent(Sprite)!;
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
    const spr = player.addComponent(Sprite);
    spr.texturePath = "res/Texture/player.png";
    spr.width = 64;
    spr.height = 64;
    player.addComponent(PlayerController);
    this.root.addChild(player);

    // Enemy
    const enemy = new Node("Enemy");
    enemy.transform.setPosition(600, 250);
    const espr = enemy.addComponent(Sprite);
    espr.texturePath = "res/Texture/bullet.png";
    espr.width = 64;
    espr.height = 64;
    enemy.addComponent(EnemyAI);
    this.root.addChild(enemy);

    // HUD label
    const hud = new Node("HUD");
    hud.transform.setPosition(20, 20);
    const label = hud.addComponent(Label);
    label.setFont("res/Font/LilitaOne-Regular.ttf", 20);
    label.setText("SDL3 + QuickJS + TS (Hot Reload Enabled)");
    this.root.addChild(hud);

    console.log("GameScene loaded — Player + Enemy + ECS ready");
  }

  onUpdate(_dt: number): void {
    // push ECS damage events, spawn bullets, etc.
  }
}

class HomeScene extends Scene {
  private playButton: Button | null = null;

  constructor() {
    super("Home");
  }

  onLoad(): void {
    const button = new Node("PlayButton");
    button.transform.setPosition(400, 300);

    const sprite = button.addComponent(Sprite);
    sprite.texturePath = "res/Texture/button.png";
    sprite.width = 220;
    sprite.height = 68;

    this.playButton = button.addComponent(Button);
    this.playButton.onClick = () => {
      Engine.scene = new GameScene();
    };

    const labelNode = new Node("PlayLabel");
    labelNode.transform.setPosition(-34, -18);

    const label = labelNode.addComponent(Label);
    label.setFont("res/Font/LilitaOne-Regular.ttf", 30);
    label.setText("PLAY");

    button.addChild(labelNode);
    this.root.addChild(button);
    console.log("HomeScene loaded");
  }

  onTouchStart(x: number, y: number): void {
    this.playButton?.handleTouchStart(x, y);
  }

  onTouchEnd(x: number, y: number): void {
    this.playButton?.handleTouchEnd(x, y);
  }
}

/* ── Bootstrap ─────────────────────────────────────── */

Engine.start("Gemma4 Engine — SDL3 + QuickJS + TS", 800, 600);
Engine.scene = new HomeScene();
