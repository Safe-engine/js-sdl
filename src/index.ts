import {
  Button,
  Component,
  Engine,
  Label,
  Node,
  PhysicsWorld,
  RigidBody,
  Scene,
  Sprite,
  box,
} from "./engine";
import { DragonBones } from "../tsx/dragonbones";

const MECHA_DRAGON_BONES = {
  skeleton: "res/DragonBones/mecha_1004d/mecha_1004d_show_ske.json",
  atlas: "res/DragonBones/mecha_1004d/mecha_1004d_show_tex.json",
  texture: "res/DragonBones/mecha_1004d/mecha_1004d_show_tex.png",
};

/* ── Custom Components ─────────────────────────────── */

class PlayerController extends Component {
  speed = 180;
  dir = 1;

  onUpdate(dt: number): void {
    const t = this.node;
    t.x += this.speed * this.dir * dt;
    if (t.x > 700) this.dir = -1;
    if (t.x < 100) this.dir = 1;
  }
}

class EnemyAI extends Component {
  lifetime = 0;

  onStart(): void {
    const sr = this.node;
    sr.width = 48;
    sr.height = 48;
  }

  onUpdate(dt: number): void {
    this.lifetime += dt;
    const t = this.node;
    t.y += Math.sin(this.lifetime * 2) * 60 * dt;
    t.x -= 40 * dt;
    if (t.x < -64) t.x = 800;
  }
}

/* ── Scene ─────────────────────────────────────────── */

class GameScene extends Scene {

  onLoad(): void {
    this.root.addComponent(PhysicsWorld, {
      gravity: { x: 0, y: 9.8 },
      pixelsPerMeter: 32,
      velocityIterations: 4,
      fixedTimeStep: 1 / 60,
      debugDraw: { enabled: true, alpha: 190 },
    });

    // Player
    const player = new Node();
    player.setPosition(300, 350);
    const spr = player.addComponent(Sprite);
    spr.texturePath = "res/Texture/player.png";
    spr.node.width = 64;
    spr.node.height = 64;
    player.addComponent(PlayerController);
    player.addComponent(RigidBody, {
      type: "dynamic",
      density: 1,
      restitution: 0.25,
      friction: 0.3,
      shapes: box(64, 64),
      onBeginContact: (other) => {
        console.log("player contact", other.tag ?? "untagged");
      },
    });
    this.root.addChild(player);

    const floor = new Node("Floor");
    floor.setPosition(360, 660);
    floor.width = 720;
    floor.height = 32;
    floor.addComponent(RigidBody, {
      type: "static",
      tag: 100,
      friction: 0.6,
      shapes: box(720, 32),
    });
    this.root.addChild(floor);

    const mecha = new Node("DragonBonesMecha");
    mecha.setPosition(520, 610);
    mecha.setScale(0.35, 0.35);
    mecha.addComponent(DragonBones, {
      data: MECHA_DRAGON_BONES,
      animation: "idle",
      playTimes: 0,
      timeScale: 1,
      onAnimationComplete: (name, count) => {
        console.log("dragonbones loop", name, count);
      },
    });
    this.root.addChild(mecha);

    // Enemy
    const enemy = new Node("Enemy");
    enemy.setPosition(600, 250);
    const espr = enemy.addComponent(Sprite);
    espr.texturePath = "res/Texture/bullet.png";
    espr.node.width = 64;
    espr.node.height = 64;
    enemy.addComponent(EnemyAI);
    this.root.addChild(enemy);

    // HUD label
    const hud = new Node("HUD");
    hud.setPosition(120, 20);
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
  constructor() {
    super("Home");
  }

  onLoad(): void {
    const button = new Node("PlayButton");
    button.setPosition(400, 300);

    const sprite = button.addComponent(Sprite);
    sprite.texturePath = "res/Texture/button.png";
    sprite.node.width = 220;
    sprite.node.height = 68;

    const playButton = button.addComponent(Button);
    playButton.props.onPress = () => {
      Engine.scene = new GameScene();
    };

    const labelNode = new Node("PlayLabel");
    // labelNode.transform.setPosition(-34, -18);

    const label = labelNode.addComponent(Label);
    label.setFont("res/Font/LilitaOne-Regular.ttf", 30);
    label.setText("PLAY");

    button.addChild(labelNode);
    this.root.addChild(button);
    console.log("HomeScene loaded");
  }

}

/* ── Bootstrap ─────────────────────────────────────── */

Engine.start("Gemma4 Engine — SDL3 + QuickJS + TS", 720, 1280);
Engine.scene = new HomeScene();
