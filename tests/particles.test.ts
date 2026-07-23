import { describe, expect, test } from 'bun:test'
import { Particles } from '../engine/components/Particles'
import { Scene } from '../engine/core/Scene'

describe('Particles', () => {
  test('removes emitted particles after their lifetime', () => {
    const particles = new Particles({ count: 3, duration: 1 })

    particles.emit(100, 200)
    expect(particles.activeCount).toBe(3)

    particles.onUpdate(1)
    expect(particles.activeCount).toBe(0)
  })

  test('can emit particles without consuming the touch', () => {
    const scene = new Scene()
    const particles = new Particles({ count: 2, emitOnTouch: true })
    scene.node.addComponent(particles)

    scene._dispatchTouchStart(100, 200)
    expect(particles.activeCount).toBe(2)
  })
})
