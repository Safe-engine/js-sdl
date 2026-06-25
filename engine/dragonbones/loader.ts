import { AssetManager } from '../AssetManager'
import {
  isDragonBonesBinaryPath,
  loadBinaryAsset,
  loadJsonAsset,
} from '../helper/resource-load'
import type { DragonBonesData, LoadedDragonBonesData } from './types'

export async function loadDragonBonesData(data: DragonBonesData): Promise<LoadedDragonBonesData> {
  const [skeleton, atlas] = await Promise.all([
    isDragonBonesBinaryPath(data.skeleton)
      ? loadBinaryAsset(data.skeleton, 'DragonBones skeleton')
      : loadJsonAsset(data.skeleton, 'DragonBones skeleton'),
    loadJsonAsset(data.atlas, 'DragonBones atlas'),
  ])

  return {
    key: `${data.skeleton}\0${data.atlas}\0${data.texture}`,
    skeleton,
    atlas,
    texture: AssetManager.acquireTexture(data.texture),
  }
}
