import { loadTextFile } from "sdl3";
import {
  AssetGroup,
  AssetManager,
  instantiate,
  Label,
  loadScene,
  Panel,
  ProgressBar,
  Scene
} from "../engine";
import * as Assets from "./assets";
import {
  sf_button
} from "./assets";
import { HomeScene } from "./HomeScene";

type DragonBonesAsset = {
  atlas?: string;
  skeleton?: string;
  texture?: string;
};

const FONT_PRELOAD_SIZES = [26, 28, 32, 36];

let loadedProjectAssets: AssetGroup | null = null;

export class LoadingScene extends Scene {
  private progressBar: ProgressBar | null = null;
  private percentLabel: Label | null = null;
  private loadStarted = false;

  onEnter(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    void this.load();
  }

  async load(): Promise<void> {
    try {
      await loadProjectAssets((progress) => {
        this.progressBar?.setFillRange(progress);
        this.percentLabel?.setText(`${Math.round(progress * 100)}%`);
        console.info("LoadingScene load assets", progress);
      });
      loadScene(HomeScene);
    } catch (error) {
      console.error("LoadingScene failed to load assets", error);
      this.percentLabel?.setText("LOAD FAILED");
    }
  }

  __view() {
    const backgroundComp = instantiate(Panel, {});
    this.root.addChild(backgroundComp.node);
    backgroundComp.node.x = 360;
    backgroundComp.node.y = 640;
    backgroundComp.node.width = 720;
    backgroundComp.node.height = 1280;
    backgroundComp.color = { r: 15, g: 23, b: 42, a: 255 };

    const titleComp = instantiate(Label, {
      string: "LOADING",
      size: 36,
      align: "center",
      verticalAlign: "middle",
    });
    this.root.addChild(titleComp.node);
    titleComp.node.x = 360;
    titleComp.node.y = 560;
    titleComp.node.width = 360;
    titleComp.node.height = 48;

    const progressBarComp = instantiate(ProgressBar, {
      spriteFrame: sf_button,
      fillRange: 0,
    });
    this.root.addChild(progressBarComp.node);
    progressBarComp.node.x = 360;
    progressBarComp.node.y = 640;
    progressBarComp.node.width = 480;
    progressBarComp.node.height = 34;
    progressBarComp.backgroundColor = { r: 30, g: 41, b: 59, a: 255 };
    progressBarComp.fillColor = { r: 255, g: 255, b: 255, a: 255 };
    this.progressBar = progressBarComp;

    const percentLabelComp = instantiate(Label, {
      string: "0%",
      size: 28,
      align: "center",
      verticalAlign: "middle",
    });
    this.root.addChild(percentLabelComp.node);
    percentLabelComp.node.x = 360;
    percentLabelComp.node.y = 700;
    percentLabelComp.node.width = 160;
    percentLabelComp.node.height = 40;
    this.percentLabel = percentLabelComp;
  }
}

async function loadProjectAssets(onProgress: (progress: number) => void): Promise<AssetGroup> {
  loadedProjectAssets?.unload();

  const group = AssetManager.createGroup();
  const textAssets = new Set<string>();
  const textureAssets = new Set<string>();
  const fontAssets = new Set<string>();

  collectProjectAssets(textureAssets, fontAssets, textAssets);

  for (const texturePath of textureAssets) {
    group.addTexture(texturePath, texturePath);
  }

  for (const fontPath of fontAssets) {
    for (const size of FONT_PRELOAD_SIZES) {
      group.addFont(`${fontPath}:${size}`, fontPath, size);
    }
  }

  const groupTotal = textureAssets.size + fontAssets.size * FONT_PRELOAD_SIZES.length;
  const total = groupTotal + textAssets.size;
  let loaded = 0;
  const report = () => onProgress(total === 0 ? 1 : loaded / total);

  report();
  await group.preload((progress) => {
    loaded = progress.loaded;
    report();
  });

  for (const path of textAssets) {
    await loadTextAsset(path);
    loaded++;
    report();
  }

  loadedProjectAssets = group;
  return group;
}

function collectProjectAssets(
  textureAssets: Set<string>,
  fontAssets: Set<string>,
  textAssets: Set<string>,
): void {
  for (const value of Object.values(Assets)) {
    if (typeof value === "string") {
      collectAssetPath(value, textureAssets, fontAssets, textAssets);
      continue;
    }

    if (isDragonBonesAsset(value)) {
      if (value.texture) textureAssets.add(value.texture);
      if (value.atlas) textAssets.add(value.atlas);
      if (value.skeleton) textAssets.add(value.skeleton);
    }
  }
}

function collectAssetPath(
  path: string,
  textureAssets: Set<string>,
  fontAssets: Set<string>,
  textAssets: Set<string>,
): void {
  if (/\.(png|jpg|jpeg|webp)$/i.test(path)) {
    textureAssets.add(path);
    return;
  }
  if (/\.(ttf|otf)$/i.test(path)) {
    fontAssets.add(path);
    return;
  }
  if (/\.(json|txt|atlas)$/i.test(path)) {
    textAssets.add(path);
  }
}

function isDragonBonesAsset(value: unknown): value is DragonBonesAsset {
  if (!value || typeof value !== "object") return false;
  const data = value as DragonBonesAsset;
  return typeof data.texture === "string" ||
    typeof data.atlas === "string" ||
    typeof data.skeleton === "string";
}

async function loadTextAsset(path: string): Promise<string> {
  if (typeof fetch === "function") {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load text asset: ${path}`);
    return response.text();
  }

  const text = loadTextFile(path);
  if (text === null) throw new Error(`Failed to load text asset: ${path}`);
  return text;
}
