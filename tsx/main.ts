import { Engine } from "../src/engine";
import { GameScene } from "./GameScene";

/* ── Bootstrap ─────────────────────────────────────── */

Engine.start("Gemma4 Engine — SDL3 + QuickJS + TS", 720, 1280);
Engine.scene = new GameScene();
