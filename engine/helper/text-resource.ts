import { loadTextFile } from 'sdl3'

const textCache = new Map<string, Promise<string>>()
const loadedTextCache = new Map<string, string>()

export function loadTextAsset(path: string, label = 'text asset'): Promise<string> {
  let promise = textCache.get(path)
  if (!promise) {
    if (typeof fetch === 'function') {
      promise = fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Failed to load ${label}: ${path}`)
        return response.text()
      })
    } else {
      const text = loadTextFile(path)
      if (text === null) throw new Error(`Failed to load ${label}: ${path}`)
      promise = Promise.resolve(text)
    }
    promise = promise.then((text) => {
      loadedTextCache.set(path, text)
      return text
    })
    textCache.set(path, promise)
  }
  return promise
}

export function getLoadedTextAsset(path: string): string | null {
  return loadedTextCache.get(path) ?? null
}
