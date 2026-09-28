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
    forgetOnFailure(jsonCache, path, promise)
    jsonCache.set(path, promise)
  }
  return promise
}

export function loadBinaryAsset(path: string, label = 'binary asset'): Promise<ArrayBuffer> {
  let promise = binaryCache.get(path)
  if (!promise) {
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      promise = fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Failed to load ${label}: ${path}`)
        return response.arrayBuffer()
      })
    } else {
      const binary = loadBinaryFile(path)
      promise = binary === null
        ? Promise.reject(new Error(`Failed to load ${label}: ${path}`))
        : Promise.resolve(binary)
    }
    forgetOnFailure(binaryCache, path, promise)
    binaryCache.set(path, promise)
  }
  return promise
}

/** Drop a rejected load from its cache so a later call can retry. */
function forgetOnFailure<T>(cache: Map<string, Promise<T>>, path: string, promise: Promise<T>): void {
  promise.catch(() => {
    if (cache.get(path) === promise) cache.delete(path)
  })
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
