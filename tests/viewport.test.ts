import { describe, expect, test } from 'bun:test'
import { Viewport } from '../engine/Viewport'

describe('Viewport', () => {
  test('converts coordinates with non-uniform stretch scaling', () => {
    const viewport = new Viewport()
    viewport.update([320, 180, 1280, 720, 0, 0, 1280, 720, 0, 0, 320, 180])

    expect(viewport.scaleX).toBe(4)
    expect(viewport.scaleY).toBe(4)
    expect(viewport.screenToWorld(640, 360)).toEqual({ x: 160, y: 90 })
    expect(viewport.worldToScreen(160, 90)).toEqual({ x: 640, y: 360 })

    viewport.update([320, 180, 1280, 800, 0, 0, 1280, 800, 0, 0, 320, 180])

    expect(viewport.scaleX).toBe(4)
    expect(viewport.scaleY).toBeCloseTo(800 / 180)
    expect(viewport.screenToWorld(640, 400)).toEqual({ x: 160, y: 90 })
    expect(viewport.worldToScreen(160, 90)).toEqual({ x: 640, y: 400 })
  })
})
