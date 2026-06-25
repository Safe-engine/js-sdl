import { TextureAtlas } from '@esotericsoftware/spine-core'
import { loadTextFile } from 'sdl3'
import { AssetManager } from '../AssetManager'
import { SdlSpineTexture } from './SdlSpineTexture'
import type { SpineData } from './types'

export interface LoadedSpineData {
  key: string
  atlas: TextureAtlas
  skeleton: any
  textures: SdlSpineTexture[]
}

const textCache = new Map<string, Promise<string>>()
const jsonCache = new Map<string, Promise<any>>()

export async function loadSpineData(data: SpineData): Promise<LoadedSpineData> {
  const [atlasText, skeleton] = await Promise.all([
    loadText(data.atlas),
    loadJson(data.skeleton),
  ])
  const atlas = new TextureAtlas(atlasText)
  const textures = atlas.pages.map((page) => {
    const path = data.texture ?? resolveSiblingPath(data.atlas, page.name)
    const texture = new SdlSpineTexture(AssetManager.acquireTexture(path))
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

function loadJson(path: string): Promise<any> {
  let promise = jsonCache.get(path)
  if (!promise) {
    promise = loadText(path).then(text => JSON.parse(text))
    jsonCache.set(path, promise)
  }
  return promise
}

function loadText(path: string): Promise<string> {
  let promise = textCache.get(path)
  if (!promise) {
    if (typeof fetch === 'function') {
      promise = fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Failed to load Spine file: ${path}`)
        return response.text()
      })
    } else {
      const text = loadTextFile(path)
      if (text === null) throw new Error(`Failed to load Spine file: ${path}`)
      promise = Promise.resolve(text)
    }
    textCache.set(path, promise)
  }
  return promise
}

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling
}
