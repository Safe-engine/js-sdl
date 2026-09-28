/**
 * Shared fake for the `sdl3` platform module, preloaded for every test file
 * (see bunfig.toml).
 *
 * Bun's `mock.module` is process-wide and engine modules stay cached across
 * test files, so per-file mocks leak into each other. Instead, `sdl3` is mocked
 * once here with stable wrappers that delegate to a swappable implementation.
 * Each test file calls `installSdl3({...})` to set the functions it cares about;
 * everything else falls back to inert defaults.
 */
import { afterEach, mock } from 'bun:test'
import * as realModule from '../../engine/sdl3'

type Sdl3 = typeof realModule
type Sdl3Impl = { -readonly [K in keyof Sdl3]: Sdl3[K] }

/** Snapshot of the real web backend, taken before the module is mocked. */
export const realSdl3: Sdl3Impl = { ...realModule }

let nextId = 1
const nextAssetId = () => nextId++

function createDefaults(): Sdl3Impl {
  const defaults = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(realSdl3)) {
    defaults[key] = typeof value === 'function' ? () => undefined : value
  }
  return Object.assign(defaults as Sdl3Impl, {
    isNative: false,
    textures: new Map(),
    loadTexture: () => nextAssetId(),
    loadFont: () => nextAssetId(),
    loadTextTexture: () => nextAssetId(),
    createDynamicTexture: () => nextAssetId(),
    loadAudio: () => nextAssetId(),
    playAudio: () => nextAssetId(),
    isAudioPlaying: () => false,
    getTextureWidth: () => 0,
    getTextureHeight: () => 0,
    loadTextFile: () => null,
    loadBinaryFile: () => null,
    getWinSize: () => ({ width: 1, height: 1 }),
    getViewportMetrics: () => [1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    getRendererStats: () => ({ fps: 0, frameTimeMs: 0, drawCalls: 0, vertices: 0 }),
  } satisfies Partial<Sdl3Impl>)
}

let impl: Sdl3Impl = createDefaults()

/** Replace the active `sdl3` implementation; unspecified members use defaults. */
export function installSdl3(overrides: Partial<Sdl3Impl> = {}): Sdl3Impl {
  impl = { ...createDefaults(), ...overrides }
  // Bun snapshots non-function exports, so re-mock to publish new constants
  // such as `isNative`. Function exports stay stable and delegate to `impl`.
  mock.module('sdl3', createExports)
  return impl
}

const functionWrappers: Record<string, unknown> = {}
for (const [key, value] of Object.entries(realSdl3)) {
  if (typeof value === 'function') {
    functionWrappers[key] = (...args: unknown[]) => (impl[key] as (...a: unknown[]) => unknown)(...args)
  }
}

function createExports(): Record<string, unknown> {
  const exports: Record<string, unknown> = { ...functionWrappers }
  for (const [key, value] of Object.entries(impl)) {
    if (typeof value !== 'function') exports[key] = value
  }
  return exports
}

mock.module('sdl3', createExports)

// The global command buffer outlives test files; discard any frame a test left
// open so later pushes auto-submit instead of queuing forever.
const { globalCommandBuffer } = await import('../../engine/render/RenderCommandBuffer')
afterEach(() => {
  globalCommandBuffer.beginFrame()
  globalCommandBuffer.isFrameActive = false
})
