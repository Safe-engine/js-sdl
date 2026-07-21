import { TextureAtlas } from '@esotericsoftware/spine-core'
import { AssetManager } from '../AssetManager'
import {
  isSpineBinaryPath,
  loadBinaryAsset,
  loadJsonAsset,
  loadTextAsset,
} from '../helper/resource-load'
import { SdlSpineTexture } from './SdlSpineTexture'
import type { SpineData } from './types'

export interface LoadedSpineData {
  key: string
  atlas: TextureAtlas
  skeleton: any
  textures: SdlSpineTexture[]
}

export async function loadSpineData(data: SpineData): Promise<LoadedSpineData> {
  const [atlasText, skeleton] = await Promise.all([
    loadTextAsset(data.atlas, 'Spine atlas'),
    isSpineBinaryPath(data.skeleton)
      ? loadBinaryAsset(data.skeleton, 'Spine skeleton')
      : loadJsonAsset(data.skeleton, 'Spine skeleton'),
  ])
  const atlas = new TextureAtlas(atlasText)
  const textures = atlas.pages.map((page) => {
    const path = data.texture ?? resolveSiblingPath(data.atlas, page.name)
    const texture = new SdlSpineTexture(AssetManager.acquireTexture(path, { pma: page.pma }))
    page.setTexture(texture)
    return texture
  })

  return {
    key: `${data.skeleton}\0${data.atlas}\0${data.texture ?? ''}`,
    atlas,
    skeleton,
    textures,
  }
}

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling
}
