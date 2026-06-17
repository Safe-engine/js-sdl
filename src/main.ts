import { Engine, loadScene } from "../engine";
import { HomeScene } from "./HomeScene";

/* ── Bootstrap ─────────────────────────────────────── */

Engine.start("Gemma4 Engine — SDL3 + QuickJS + TS", 720, 1280);
loadScene(HomeScene);
