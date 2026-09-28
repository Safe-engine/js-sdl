import { expect, test } from 'bun:test'
import { installSdl3 } from './setup/sdl3'

let widthQueries = 0
let heightQueries = 0

installSdl3({
  getTextureHeight: () => {
    heightQueries++
    return 32
  },
  getTextureWidth: () => {
    widthQueries++
    return 64
  },
  isNative: true,
  loadTexture: () => 1,
  releaseTexture: () => {},
})

// AssetManager reads `isNative` at module load; the query string gives this
// file its own instance instead of the one cached by earlier test files.
const { AssetManager } = await import('../engine/AssetManager?native')

test('native texture dimensions are queried once when acquired', () => {
  const texture = AssetManager.acquireTexture('native-cache-test.png')
  const sharedTexture = AssetManager.acquireTexture('native-cache-test.png')

  expect(widthQueries).toBe(1)
  expect(heightQueries).toBe(1)
  expect(sharedTexture.id).toBe(texture.id)
  expect(texture.width).toBe(64)
  expect(texture.width).toBe(64)
  expect(sharedTexture.width).toBe(64)
  expect(texture.height).toBe(32)
  expect(texture.height).toBe(32)
  expect(sharedTexture.height).toBe(32)
  expect(widthQueries).toBe(1)
  expect(heightQueries).toBe(1)

  sharedTexture.release()
  texture.release()
})
