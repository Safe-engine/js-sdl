import { loadBinaryFile } from 'sdl3'
import { loadTextAsset } from './text-resource'

const jsonCache = new Map<string, Promise<any>>()
const binaryCache = new Map<string, Promise<ArrayBuffer>>()

export { loadTextAsset } from './text-resource'

export function isSpineBinaryPath(path: string): boolean {
  return /\.skel$/i.test(stripAssetQuery(path))
}

export function isDragonBonesBinaryPath(path: string): boolean {
  return /\.dbbin$/i.test(stripAssetQuery(path))
}

export function isBinaryAssetPath(path: string): boolean {
  return isSpineBinaryPath(path) || isDragonBonesBinaryPath(path)
}

export function loadJsonAsset<T = any>(path: string, label = 'JSON asset'): Promise<T> {
  let promise = jsonCache.get(path)
  if (!promise) {
    promise = loadTextAsset(path, label).then(text => JSON.parse(text) as T)
    jsonCache.set(path, promise)
  }
  return promise
}

export function loadBinaryAsset(path: string, label = 'binary asset'): Promise<ArrayBuffer> {
  let promise = binaryCache.get(path)
  if (!promise) {
    if (typeof fetch === 'function') {
      promise = fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Failed to load ${label}: ${path}`)
        return response.arrayBuffer()
      })
    } else {
      const binary = loadBinaryFile(path)
      if (binary === null) throw new Error(`Failed to load ${label}: ${path}`)
      promise = Promise.resolve(binary)
    }
    binaryCache.set(path, promise)
  }
  return promise
}

function stripAssetQuery(path: string): string {
  const queryIndex = path.indexOf('?')
  const hashIndex = path.indexOf('#')
  const cutIndex
    = queryIndex < 0
      ? hashIndex
      : hashIndex < 0
        ? queryIndex
        : Math.min(queryIndex, hashIndex)
  return cutIndex >= 0 ? path.slice(0, cutIndex) : path
}
