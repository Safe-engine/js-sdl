import { loadTextFile } from "sdl3";
import { AssetGroup, AssetManager } from "../AssetManager";

type DragonBonesAsset = {
  atlas?: string;
  skeleton?: string;
  texture?: string;
};

const loadedAssetGroups = new WeakMap<object, AssetGroup>();

export async function loadAll(assets: any, cb?: (progress: number) => void) {
  unloadAll(assets);

  const group = AssetManager.createGroup();
  const textAssets = new Set<string>();
  const textureAssets = new Set<string>();
  const fontAssets = new Set<string>();

  collectAssets(assets, textureAssets, fontAssets, textAssets);

  for (const texturePath of textureAssets) {
    group.addTexture(texturePath, texturePath);
  }

  for (const fontPath of fontAssets) {
    group.addFont(`${fontPath}:${0}`, fontPath, 0);
  }

  const groupTotal = textureAssets.size + fontAssets.size;
  const total = groupTotal + textAssets.size;
  let loaded = 0;
  const report = () => cb?.(total === 0 ? 1 : loaded / total);

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

  if (assets && typeof assets === "object") {
    loadedAssetGroups.set(assets, group);
  }

  return group;
}

export function unloadAll(assets: any) {
  if (!assets || typeof assets !== "object") return;
  loadedAssetGroups.get(assets)?.unload();
  loadedAssetGroups.delete(assets);
}

function collectAssets(
  assets: any,
  textureAssets: Set<string>,
  fontAssets: Set<string>,
  textAssets: Set<string>,
): void {
  if (!assets || typeof assets !== "object") return;

  for (const value of Object.values(assets)) {
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
