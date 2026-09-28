import { loadTextFile } from 'sdl3'

const textCache = new Map<string, Promise<string>>()
const loadedTextCache = new Map<string, string>()

export function loadTextAsset(path: string, label = 'text asset'): Promise<string> {
  let promise = textCache.get(path)
  if (!promise) {
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      promise = fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Failed to load ${label}: ${path}`)
        return response.text()
      })
    } else {
      const text = loadTextFile(path)
      promise = text === null
        ? Promise.reject(new Error(`Failed to load ${label}: ${path}`))
        : Promise.resolve(text)
    }
    promise = promise.then((text) => {
      loadedTextCache.set(path, text)
      return text
    }, (error) => {
      // Forget failures so a later call can retry.
      textCache.delete(path)
      throw error
    })
    textCache.set(path, promise)
  }
  return promise
}

export function getLoadedTextAsset(path: string): string | null {
  return loadedTextCache.get(path) ?? null
}
