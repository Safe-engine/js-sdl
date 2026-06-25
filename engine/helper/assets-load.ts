import { AssetGroup, AssetManager } from '../AssetManager'
import { spriteFrameCache } from '../SpriteFrameCache'
import { isBinaryAssetPath, loadBinaryAsset, loadTextAsset } from './resource-load'

type DragonBonesAsset = {
  atlas?: string
  skeleton?: string
  texture?: string
}

type SpriteFrameAtlasAsset = {
  atlas: string
  texture: string
  prefix?: string
}

const loadedAssetGroups = new WeakMap<object, AssetGroup>()

export async function loadAll(assets: any, cb?: (progress: number) => void) {
  unloadAll(assets)

  const group = AssetManager.createGroup()
  const textAssets = new Set<string>()
  const binaryAssets = new Set<string>()
  const textureAssets = new Set<string>()
  const fontAssets = new Set<string>()

  collectAssets(assets, textureAssets, fontAssets, textAssets, binaryAssets)

  for (const texturePath of textureAssets) {
    group.addTexture(texturePath, texturePath)
    spriteFrameCache.addTexture(texturePath)
  }

  for (const fontPath of fontAssets) {
    group.addFont(`${fontPath}:${0}`, fontPath, 0)
  }

  const groupTotal = textureAssets.size + fontAssets.size
  const total = groupTotal + textAssets.size + binaryAssets.size
  let loaded = 0
  const report = () => cb?.(total === 0 ? 1 : loaded / total)

  report()
  await group.preload((progress) => {
    loaded = progress.loaded
    report()
  })

  for (const path of textAssets) {
    await loadTextAsset(path)
    loaded++
    report()
  }

  for (const path of binaryAssets) {
    await loadBinaryAsset(path)
    loaded++
    report()
  }

  for (const value of Object.values(assets ?? {})) {
    if (!isSpriteFrameAtlasAsset(value)) continue
    await spriteFrameCache.loadAtlas(value.texture, value.atlas, {
      prefix: value.prefix,
    })
  }

  if (assets && typeof assets === 'object') {
    loadedAssetGroups.set(assets, group)
  }

  return group
}

export function unloadAll(assets: any) {
  if (!assets || typeof assets !== 'object') return
  loadedAssetGroups.get(assets)?.unload()
  loadedAssetGroups.delete(assets)
}

function collectAssets(
  assets: any,
  textureAssets: Set<string>,
  fontAssets: Set<string>,
  textAssets: Set<string>,
  binaryAssets: Set<string>,
): void {
  if (!assets || typeof assets !== 'object') return

  for (const value of Object.values(assets)) {
    if (typeof value === 'string') {
      collectAssetPath(value, textureAssets, fontAssets, textAssets, binaryAssets)
      continue
    }

    if (isSpriteFrameAtlasAsset(value)) {
      textureAssets.add(value.texture)
      textAssets.add(value.atlas)
      continue
    }

    if (isDragonBonesAsset(value)) {
      if (value.texture) textureAssets.add(value.texture)
      if (value.atlas) {
        collectAssetPath(value.atlas, textureAssets, fontAssets, textAssets, binaryAssets)
      }
      if (value.skeleton) {
        collectAssetPath(value.skeleton, textureAssets, fontAssets, textAssets, binaryAssets)
      }
    }
  }
}

function collectAssetPath(
  path: string,
  textureAssets: Set<string>,
  fontAssets: Set<string>,
  textAssets: Set<string>,
  binaryAssets: Set<string>,
): void {
  if (/\.(png|jpg|jpeg|webp)$/i.test(path)) {
    textureAssets.add(path)
    return
  }
  if (/\.(ttf|otf)$/i.test(path)) {
    fontAssets.add(path)
    return
  }
  if (isBinaryAssetPath(path)) {
    binaryAssets.add(path)
    return
  }
  if (/\.(json|txt|atlas)$/i.test(path)) {
    textAssets.add(path)
  }
}

function isDragonBonesAsset(value: unknown): value is DragonBonesAsset {
  if (!value || typeof value !== 'object') return false
  const data = value as DragonBonesAsset
  return typeof data.texture === 'string'
    || typeof data.atlas === 'string'
    || typeof data.skeleton === 'string'
}

function isSpriteFrameAtlasAsset(value: unknown): value is SpriteFrameAtlasAsset {
  if (!value || typeof value !== 'object') return false
  const data = value as SpriteFrameAtlasAsset & { skeleton?: unknown }
  return typeof data.texture === 'string'
    && typeof data.atlas === 'string'
    && typeof data.skeleton !== 'string'
}
