import { describe, expect, mock, test } from 'bun:test'
import { Scene } from '../engine/core/Scene'

mock.module('sdl3', () => ({
  getTextureHeight: () => 16,
  getTextureWidth: () => 16,
  isNative: true,
  loadTextFile: () => null,
  loadTexture: () => 1,
  releaseTexture: () => {},
  submitCommandBuffer: () => {},
}))

const { Particles } = await import('../engine/components/Particles')
const { CMD_DRAW_SPRITE, globalCommandBuffer } = await import('../engine/render/RenderCommandBuffer')

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

  test('renders particles with their sprite frame when provided', () => {
    const scene = new Scene()
    const particles = new Particles({ count: 1, spriteFrame: 'particle.png' })
    scene.node.addComponent(particles)

    particles.emit(100, 200)
    globalCommandBuffer.beginFrame()
    particles.onRender()

    expect(globalCommandBuffer.commands[0]).toBe(CMD_DRAW_SPRITE)
    expect(globalCommandBuffer.uintBuffer[0]).toBe(1)
  })
})
