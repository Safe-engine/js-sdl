import { strFromU8, unzipSync } from 'fflate'
import { loadTextureData, releaseTexture } from 'sdl3'
import { loadBinaryAsset } from '../helper/resource-load'
import type { SkelFormArmature, SkelFormData } from './types'

export interface LoadedSkelForm {
  armature: SkelFormArmature
  textureIds: number[]
  release(): void
}

let memoryAssetId = 0

export async function loadSkelForm(data: SkelFormData): Promise<LoadedSkelForm> {
  const source = typeof data === 'string'
    ? await loadBinaryAsset(data, 'SkelForm file')
    : toArrayBuffer(data)
  const sourceKey = typeof data === 'string'
    ? data
    : `memory-skelform:${memoryAssetId++}`
  const files = unzipSync(new Uint8Array(source))
  const armatureEntry = findEntry(files, 'armature.json')
  if (!armatureEntry) throw new Error('Invalid SkelForm file: armature.json is missing.')

  const armature = JSON.parse(strFromU8(armatureEntry)) as SkelFormArmature
  if (!Array.isArray(armature.bones) || !Array.isArray(armature.atlases)) {
    throw new Error('Invalid SkelForm file: malformed armature data.')
  }

  const textureIds: number[] = []
  try {
    for (let index = 0; index < armature.atlases.length; index++) {
      const atlas = armature.atlases[index]
      const image = findEntry(files, atlas.filename)
      if (!image) {
        throw new Error(`Invalid SkelForm file: ${atlas.filename} is missing.`)
      }
      const textureId = loadTextureData(
        `${sourceKey}::skelform-atlas:${atlas.filename}`,
        toArrayBuffer(image),
      )
      if (textureId < 0) {
        throw new Error(`Failed to load SkelForm atlas: ${atlas.filename}`)
      }
      atlas.textureId = textureId
      textureIds.push(textureId)
    }
  } catch (error) {
    for (const textureId of textureIds) releaseTexture(textureId)
    throw error
  }

  let released = false
  return {
    armature,
    textureIds,
    release() {
      if (released) return
      released = true
      for (const textureId of textureIds) releaseTexture(textureId)
    },
  }
}

function findEntry(
  files: Record<string, Uint8Array>,
  name: string,
): Uint8Array | undefined {
  return files[name]
    ?? Object.entries(files).find(([path]) => path.endsWith(`/${name}`))?.[1]
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}
