import { Engine } from "../src/engine";
import { loadScene } from "../src/engine/core/instantiate";
import { HomeScene } from "./HomeScene";

/* ── Bootstrap ─────────────────────────────────────── */

Engine.start("Gemma4 Engine — SDL3 + QuickJS + TS", 720, 1280);
loadScene(HomeScene);
