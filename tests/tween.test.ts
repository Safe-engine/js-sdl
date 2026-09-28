import { afterEach, describe, expect, test } from 'bun:test'
import { Easing } from '../engine/animation/Easing'
import { Tween } from '../engine/animation/Tween'

afterEach(() => {
  Tween.stopAll()
})

describe('Tween', () => {
  test('interpolates linearly and completes at the duration', () => {
    const state = { value: 10 }
    let completed = 0
    Tween.to(state, { value: 20 }, 2, { onComplete: () => completed++ })

    Tween.update(0.5)
    expect(state.value).toBe(12.5)
    Tween.update(1.5)
    expect(state.value).toBe(20)
    expect(completed).toBe(1)

    // Finished tweens are dropped and never fire again.
    Tween.update(1)
    expect(completed).toBe(1)
  })

  test('overshooting dt clamps to the target value', () => {
    const state = { value: 0 }
    Tween.to(state, { value: 5 }, 0.1)
    Tween.update(10)
    expect(state.value).toBe(5)
  })

  test('zero duration jumps straight to the target', () => {
    const state = { value: 0 }
    Tween.to(state, { value: 7 }, 0)
    Tween.update(0)
    expect(state.value).toBe(7)
  })

  test('reads start values when the tween starts, after its delay', () => {
    const state = { value: 0 }
    const events: string[] = []
    Tween.to(state, { value: 100 }, 1, {
      delay: 0.5,
      onStart: () => events.push(`start:${state.value}`),
    })

    Tween.update(0.25)
    state.value = 50
    expect(events).toEqual([])
    Tween.update(0.25)
    expect(events).toEqual(['start:50'])
    Tween.update(0.5)
    expect(state.value).toBe(75)
  })

  test('tweens nested numeric properties', () => {
    const state = { position: { x: 0, y: 10 }, scale: 1 }
    Tween.to(state, { position: { x: 10, y: 0 }, scale: 3 }, 1)
    Tween.update(0.5)
    expect(state).toEqual({ position: { x: 5, y: 5 }, scale: 2 })
  })

  test('applies the easing function to progress', () => {
    const state = { value: 0 }
    const progress: number[] = []
    Tween.to(state, { value: 100 }, 1, {
      ease: Easing.quadIn,
      onUpdate: p => progress.push(p),
    })
    Tween.update(0.5)
    expect(state.value).toBe(25)
    expect(progress).toEqual([0.5])
  })

  test('rejects non-numeric targets when the tween starts', () => {
    const state = { label: 'a' } as any
    Tween.to(state, { label: 1 } as any, 1)
    expect(() => Tween.update(0.1)).toThrow(TypeError)
  })

  test('stop fires onStop once and prevents further updates', () => {
    const state = { value: 0 }
    let stops = 0
    const tween = Tween.to(state, { value: 10 }, 1, { onStop: () => stops++ })
    Tween.update(0.5)
    tween.stop()
    tween.stop()
    Tween.update(0.5)
    expect(state.value).toBe(5)
    expect(stops).toBe(1)
  })

  test('stopAll during an update stops animations not yet visited', () => {
    const a = { value: 0 }
    const b = { value: 0 }
    Tween.to(a, { value: 10 }, 1, { onUpdate: () => Tween.stopAll() })
    Tween.to(b, { value: 10 }, 1)
    Tween.update(0.5)
    Tween.update(0.5)
    expect(a.value).toBe(5)
    expect(b.value).toBe(0)
  })
})

describe('TweenSequence', () => {
  test('runs tweens, delays and calls in order', () => {
    const state = { value: 0 }
    const events: string[] = []
    Tween.sequence()
      .to(state, { value: 10 }, 1)
      .call(() => events.push(`call:${state.value}`))
      .delay(0.5)
      .call(() => events.push('after-delay'))
      .to(state, { value: 0 }, 1)
      .start()

    Tween.update(1)
    expect(events).toEqual(['call:10'])
    Tween.update(0.25)
    expect(events).toEqual(['call:10'])
    Tween.update(0.25)
    expect(events).toEqual(['call:10', 'after-delay'])
    Tween.update(0.5)
    expect(state.value).toBe(5)
    Tween.update(0.5)
    expect(state.value).toBe(0)
  })

  test('start is idempotent', () => {
    const state = { value: 0 }
    const sequence = Tween.sequence().to(state, { value: 10 }, 1)
    sequence.start().start()
    Tween.update(0.5)
    expect(state.value).toBe(5)
  })

  test('Tween.delay invokes the callback once after the delay', () => {
    let calls = 0
    Tween.delay(1, () => calls++)
    Tween.update(0.5)
    expect(calls).toBe(0)
    Tween.update(0.5)
    Tween.update(1)
    expect(calls).toBe(1)
  })

  test('stopping a sequence stops its active tween', () => {
    const state = { value: 0 }
    let stopped = false
    const sequence = Tween.sequence()
      .to(state, { value: 10 }, 1, { onStop: () => { stopped = true } })
      .start()
    Tween.update(0.2)
    sequence.stop()
    Tween.update(1)
    expect(stopped).toBe(true)
    expect(state.value).toBeCloseTo(2)
  })
})

describe('Easing', () => {
  test('every easing maps 0 to 0 and 1 to 1', () => {
    for (const [name, ease] of Object.entries(Easing)) {
      expect({ name, value: ease(0) }).toEqual({ name, value: expect.closeTo(0, 10) })
      expect({ name, value: ease(1) }).toEqual({ name, value: expect.closeTo(1, 10) })
    }
  })

  test('in-out easings pass through the midpoint', () => {
    expect(Easing.quadInOut(0.5)).toBeCloseTo(0.5)
    expect(Easing.cubicInOut(0.5)).toBeCloseTo(0.5)
    expect(Easing.sineInOut(0.5)).toBeCloseTo(0.5)
  })

  test('backOut overshoots past 1 before settling', () => {
    const samples = Array.from({ length: 99 }, (_, i) => Easing.backOut((i + 1) / 100))
    expect(Math.max(...samples)).toBeGreaterThan(1)
  })
})
