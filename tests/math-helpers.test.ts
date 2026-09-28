import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { clamp01, getMax, getMin, randomRange, randomRangeInt } from '../engine/helper/math'

let randomSpy: ReturnType<typeof spyOn> | null = null

function mockRandom(value: number): void {
  randomSpy ??= spyOn(Math, 'random')
  randomSpy.mockReturnValue(value)
}

afterEach(() => {
  randomSpy?.mockRestore()
  randomSpy = null
})

describe('math helpers', () => {
  test('clamp01 clamps into [0, 1]', () => {
    expect(clamp01(-2)).toBe(0)
    expect(clamp01(0.25)).toBe(0.25)
    expect(clamp01(3)).toBe(1)
  })

  test('getMin and getMax return null for empty arrays', () => {
    expect(getMin([])).toBeNull()
    expect(getMax([])).toBeNull()
    expect(getMin([3, -1, 2])).toBe(-1)
    expect(getMax([3, -1, 2])).toBe(3)
  })

  test('randomRange covers [min, max) for float ranges narrower than 1', () => {
    mockRandom(0)
    expect(randomRange(0.25, 0.75)).toBe(0.25)
    mockRandom(0.5)
    expect(randomRange(0.25, 0.75)).toBe(0.5)
    mockRandom(0.999999)
    const high = randomRange(0.25, 0.75)
    expect(high).toBeLessThan(0.75)
    expect(high).toBeGreaterThan(0.74)
  })

  test('randomRangeInt returns every integer in [min, max) uniformly', () => {
    const counts = new Map<number, number>()
    const steps = 1000
    for (let i = 0; i < steps; i++) {
      mockRandom(i / steps)
      const value = randomRangeInt(2, 6)
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    expect([...counts.keys()].sort()).toEqual([2, 3, 4, 5])
    for (const count of counts.values()) expect(count).toBe(steps / 4)
  })
})
