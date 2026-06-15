import {
  Engine,
  Scene,
  Node,
  Component,
  Sprite,
  Label,
  Button,
} from "../src/engine";
import { HomeScene } from "./HomeScene";

/* ── Bootstrap ─────────────────────────────────────── */

Engine.start("Gemma4 Engine — SDL3 + QuickJS + TS", 720, 1280);
Engine.scene = new HomeScene();
