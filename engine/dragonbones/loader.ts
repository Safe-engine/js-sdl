import { loadTextFile } from 'sdl3'
import { AssetManager } from '../AssetManager'
import type { DragonBonesData, LoadedDragonBonesData } from './types'

const jsonCache = new Map<string, Promise<any>>()

export async function loadDragonBonesData(data: DragonBonesData): Promise<LoadedDragonBonesData> {
  const [skeleton, atlas] = await Promise.all([
    loadJson(data.skeleton),
    loadJson(data.atlas),
  ])

  return {
    key: `${data.skeleton}\0${data.atlas}\0${data.texture}`,
    skeleton,
    atlas,
    texture: AssetManager.acquireTexture(data.texture),
  }
}

function loadJson(path: string): Promise<any> {
  let promise = jsonCache.get(path)
  if (!promise) {
    if (typeof fetch === 'function') {
      promise = fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Failed to load DragonBones JSON: ${path}`)
        return response.json()
      })
    } else {
      const text = loadTextFile(path)
      if (text === null) {
        throw new Error(`Failed to load DragonBones JSON: ${path}`)
      }
      promise = Promise.resolve(JSON.parse(text))
    }
    jsonCache.set(path, promise)
  }
  return promise
}
