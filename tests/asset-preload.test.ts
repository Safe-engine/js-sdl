import { describe, expect, test } from 'bun:test'
import { AssetManager, type PreloadProgress } from '../engine/AssetManager'
import { installSdl3, realSdl3 } from './setup/sdl3'

interface Deferred {
  resolve(): void
  reject(error: Error): void
  promise: Promise<void>
}

function deferred(): Deferred {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { resolve, reject, promise }
}

/** Fake web backend whose textures finish loading when the test says so. */
function installAsyncBackend() {
  const pending = new Map<number, Deferred>()
  const released: number[] = []
  let nextId = 100
  installSdl3({
    loadTexture: () => {
      const id = nextId++
      pending.set(id, deferred())
      return id
    },
    whenTextureReady: (id: number) => pending.get(id)?.promise ?? Promise.resolve(),
    releaseTexture: (id: number) => {
      released.push(id)
    },
  })
  return { pending, released }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('AssetGroup.preload', () => {
  test('waits until textures have actually loaded and reports progress per asset', async () => {
    const { pending } = installAsyncBackend()
    const progress: PreloadProgress[] = []
    let done = false
    const group = AssetManager.createGroup()
      .addTexture('a', 'preload-a.png')
      .addTexture('b', 'preload-b.png')

    const preloading = group.preload(p => progress.push(p)).then(() => {
      done = true
    })
    await flush()
    expect(done).toBe(false)
    expect(progress).toEqual([])

    const [idA, idB] = [...pending.keys()]
    pending.get(idB)!.resolve()
    await flush()
    expect(done).toBe(false)
    expect(progress).toEqual([{ loaded: 1, total: 2, progress: 0.5, key: 'b' }])

    pending.get(idA)!.resolve()
    await preloading
    expect(progress.at(-1)).toEqual({ loaded: 2, total: 2, progress: 1, key: 'a' })
    group.unload()
  })

  test('rejects and releases everything when a texture fails to load', async () => {
    const { pending, released } = installAsyncBackend()
    const group = AssetManager.createGroup()
      .addTexture('ok', 'preload-ok.png')
      .addTexture('broken', 'preload-broken.png')

    const progress: string[] = []
    const preloading = group.preload(p => progress.push(p.key))
    await flush()
    const [okId, brokenId] = [...pending.keys()]
    pending.get(brokenId)!.reject(new Error('Failed to load texture: preload-broken.png'))

    await expect(preloading).rejects.toThrow('preload-broken.png')
    expect(released.sort()).toEqual([okId, brokenId].sort())
    expect(group.get('ok')).toBeNull()

    // A texture finishing after the failure must not report progress.
    pending.get(okId)!.resolve()
    await flush()
    expect(progress).toEqual([])
  })

  test('resolves immediately on backends that load synchronously', async () => {
    // The native module does not export whenTextureReady/whenFontReady.
    installSdl3({ loadTexture: () => 1, loadFont: () => 2 })
    const group = AssetManager.createGroup()
      .addTexture('t', 'preload-sync.png')
      .addFont('f', 'preload-sync.ttf', 12)

    await group.preload()

    expect(group.get('t')).not.toBeNull()
    expect(group.get('f')).not.toBeNull()
    group.unload()
  })
})

describe('web backend texture readiness', () => {
  test('whenTextureReady rejects when the image fails to load', async () => {
    installSdl3(realSdl3)
    const images: Array<{ onerror?: () => void }> = []
    const originalImage = (globalThis as any).Image
    const originalError = console.error
    ;(globalThis as any).Image = class {
      onload?: () => void
      onerror?: () => void
      set src(_value: string) {
        images.push(this)
      }
    }
    console.error = () => {}
    try {
      const id = realSdl3.loadTexture('web-missing.png')
      images[0].onerror!()

      await expect(realSdl3.whenTextureReady(id)).rejects.toThrow('web-missing.png')
      realSdl3.releaseTexture(id)
      await expect(realSdl3.whenTextureReady(id)).resolves.toBeUndefined()
    } finally {
      ;(globalThis as any).Image = originalImage
      console.error = originalError
    }
  })
})
