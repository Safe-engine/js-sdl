import { describe, expect, test } from 'bun:test'

// A private instance of the web backend: its module-level state (canvas, loop
// timing) must not be shared with renderer tests that create a mock window.
const realSdl3 = await import('../engine/sdl3?frame-pacing')

describe('web frame pacing', () => {
  test('caps at ~60 updates per second on 60, 90, 120 and 144 Hz displays', async () => {
    let rafCallback: ((time: number) => void) | null = null
    ;(globalThis as any).requestAnimationFrame = (callback: (time: number) => void) => {
      rafCallback = callback
      return 1
    }
    let updates = 0
    realSdl3.onUpdate(() => {
      updates++
    })
    realSdl3.onRender(() => {})
    realSdl3.onInit(() => {})
    await Promise.resolve()
    expect(rafCallback).not.toBeNull()

    let time = 1000
    const updatesPerSecond = (hz: number): number => {
      // Warm up so pacing state from the previous rate settles.
      for (let i = 0; i < hz; i++) rafCallback!((time += 1000 / hz))
      updates = 0
      for (let i = 0; i < hz; i++) rafCallback!((time += 1000 / hz))
      return updates
    }

    for (const hz of [60, 90, 120, 144]) {
      const rate = updatesPerSecond(hz)
      expect({ hz, ok: rate >= 58 && rate <= 61 }).toEqual({ hz, ok: true })
    }
  })
})
