import { describe, expect, mock, test } from 'bun:test'
import { Scene } from '../engine/core/Scene'

const loadTexture = mock(() => 1)

mock.module('sdl3', () => ({
  getTextureHeight: () => 16,
  getTextureWidth: () => 16,
  isNative: true,
  loadTextFile: () => null,
  loadTexture,
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

  test('loads PMA particle textures with PMA enabled', () => {
    const scene = new Scene()
    const particles = new Particles({ spriteFrame: 'particle-pma.png', pma: true })
    scene.node.addComponent(particles)

    expect(loadTexture).toHaveBeenLastCalledWith('particle-pma.png', true)
  })

  test('renders PMA particles additively so black backgrounds do not obscure the scene', () => {
    const scene = new Scene()
    const particles = new Particles({ count: 1, spriteFrame: 'particle-black.png', pma: true })
    scene.node.addComponent(particles)

    particles.emit(100, 200)
    globalCommandBuffer.beginFrame()
    particles.onRender()

    expect(globalCommandBuffer.uintBuffer[0]).toBe(0x80000001)
  })

  test('loads particle props from a JSON config file', async () => {
    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({ count: 5, duration: 2, emitOnTouch: true }),
    })

    try {
      const particles = new Particles({ configFile: 'particle-config.json', count: 2 })

      await particles.reload()
      particles.emit(100, 200)

      expect(particles.activeCount).toBe(2)
      expect(particles.props.duration).toBe(2)
      expect(particles.inputEnabled).toBe(true)
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })
})
