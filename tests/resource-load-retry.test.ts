import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { loadBinaryAsset, loadJsonAsset, loadTextAsset } from '../engine/helper/resource-load'
import { installSdl3 } from './setup/sdl3'

// Other test files install a fake `window`; force the native (sdl3) code path.
let savedWindow: unknown
beforeEach(() => {
  savedWindow = (globalThis as any).window
  delete (globalThis as any).window
})
afterEach(() => {
  ;(globalThis as any).window = savedWindow
})

describe('resource loading retries', () => {
  test('a failed text load rejects instead of throwing and can be retried', async () => {
    let text: string | null = null
    installSdl3({ loadTextFile: () => text })

    const first = loadTextAsset('retry.txt')
    expect(first).toBeInstanceOf(Promise)
    await expect(first).rejects.toThrow('retry.txt')

    text = 'hello'
    await expect(loadTextAsset('retry.txt')).resolves.toBe('hello')
  })

  test('a failed JSON load can be retried', async () => {
    let text: string | null = null
    installSdl3({ loadTextFile: () => text })

    await expect(loadJsonAsset('retry.json')).rejects.toThrow('retry.json')

    text = '{"ok":true}'
    await expect(loadJsonAsset('retry.json')).resolves.toEqual({ ok: true })
  })

  test('a failed binary load can be retried', async () => {
    let binary: ArrayBuffer | null = null
    installSdl3({ loadBinaryFile: () => binary })

    await expect(loadBinaryAsset('retry.skel')).rejects.toThrow('retry.skel')

    binary = new ArrayBuffer(4)
    await expect(loadBinaryAsset('retry.skel')).resolves.toBe(binary)
  })
})
