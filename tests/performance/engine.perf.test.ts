import { describe, expect, test } from 'bun:test'
import { budget, measure, report } from './perf-utils'
import {
  cameraSceneTree,
  colliders,
  commandBufferGrowth,
  commandBufferSprites,
  matrixMultiply,
  sceneTree,
  tweens,
  type Workload,
} from './workloads'

/** Median time of `workload`, after checking it did real work. */
function time(workload: Workload): number {
  try {
    const ms = measure(() => workload.run(), workload)
    report(workload.name, ms)
    expect(workload.verify()).toBe(true)
    return ms
  } finally {
    workload.dispose?.()
  }
}

describe('performance', () => {
  test('RenderCommandBuffer records 20k sprites per frame', () => {
    expect(time(commandBufferSprites())).toBeLessThan(budget(15))
  })

  test('RenderCommandBuffer grows its buffers without quadratic copying', () => {
    expect(time(commandBufferGrowth())).toBeLessThan(budget(30))
  })

  test('updates and renders a 5k-node scene tree within a frame budget', () => {
    expect(time(sceneTree())).toBeLessThan(budget(16))
  })

  test('renders a 5k-node scene tree through a camera within a frame budget', () => {
    expect(time(cameraSceneTree())).toBeLessThan(budget(16))
  })

  test('collision broadphase scales sub-quadratically', () => {
    const smallMs = time(colliders(250))
    const largeMs = time(colliders(1000))
    expect(largeMs).toBeLessThan(budget(16))
    // 4x the colliders: sweep-and-prune should cost ~4-6x, brute force 16x.
    // The floor keeps timer noise on very fast runs from failing the ratio.
    expect(largeMs).toBeLessThan(Math.max(smallMs, 0.25) * 10)
  })

  test('Tween.update advances 10k tweens per frame', () => {
    expect(time(tweens())).toBeLessThan(budget(10))
  })

  test('Matrix2D multiplies 1M times', () => {
    expect(time(matrixMultiply())).toBeLessThan(budget(60))
  })
})
