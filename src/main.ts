import { Engine, Label, loadScene } from '../engine'
import { lilita_one_regularFont } from './assets'
import { LoadingScene } from './LoadingScene'

/* ── Bootstrap ─────────────────────────────────────── */

Engine.start('Gemma4 Engine — SDL3 + QuickJS + TS', 720, 1280)
Label.defaultFont = lilita_one_regularFont
loadScene(LoadingScene)
