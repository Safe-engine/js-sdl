import { describe, expect, test } from 'bun:test'
import { Tween } from '../../engine/animation/Tween'
import { BoxCollider, CircleCollider, CollideSystem } from '../../engine/collider'
import { ComponentX } from '../../engine/core/ComponentX'
import { Node } from '../../engine/core/Node'
import { Matrix2D } from '../../engine/math/Matrix2D'
import { RenderCommandBuffer } from '../../engine/render/RenderCommandBuffer'
import { budget, measure, report, seededRandom } from './perf-utils'

class SpriteLike extends ComponentX {
  static buffer: RenderCommandBuffer | null = null
  override onRender(): void {
    const node = this.node
    SpriteLike.buffer!.pushSpriteTransformed(
      node.renderMatrix, 1, 64, 64, 0, 0, node.width, node.height, 0, 0, 0, false, false,
    )
  }
}

class Spinner extends ComponentX {
  override onUpdate(dt: number): void {
    this.node.rotation += dt * 90
  }
}

/** A root with `groups` children of `perGroup` leaves, every leaf drawing a sprite. */
function buildTree(groups: number, perGroup: number): Node {
  const root = new Node('root')
  for (let g = 0; g < groups; g++) {
    const group = root.addChild(new Node(`g${g}`))
    group.x = g * 10
    group.addComponent(Spinner)
    for (let i = 0; i < perGroup; i++) {
      const leaf = group.addChild(new Node(`n${i}`))
      leaf.x = i
      leaf.y = i * 2
      leaf.width = 32
      leaf.height = 32
      leaf.addComponent(SpriteLike)
    }
  }
  root._startTree()
  return root
}

/** Moves every collider a little so each frame does real broadphase work. */
function stepColliders(root: Node, frame: number): void {
  const children = root.children
  for (let i = 0; i < children.length; i++) {
    children[i].x += ((i + frame) % 3) - 1
    children[i].y += ((i * 7 + frame) % 3) - 1
  }
  root._updateTree(1 / 60)
}

function buildColliders(count: number): Node {
  const rand = seededRandom(7)
  const root = new Node('root')
  root.addComponent(CollideSystem)
  // Constant density: the world grows with the collider count, so the number
  // of touching pairs per collider stays roughly the same.
  const side = Math.sqrt(count) * 40
  for (let i = 0; i < count; i++) {
    const node = root.addChild(new Node(`c${i}`))
    node.x = rand() * side
    node.y = rand() * side
    if (i % 2 === 0) node.addComponent(BoxCollider, { width: 20, height: 20 })
    else node.addComponent(CircleCollider, { radius: 10 })
  }
  root._startTree()
  return root
}

describe('performance', () => {
  test('RenderCommandBuffer records 20k sprites per frame', () => {
    const buffer = new RenderCommandBuffer()
    const matrix = new Matrix2D()
    const ms = measure(() => {
      buffer.beginFrame()
      for (let i = 0; i < 20_000; i++) {
        matrix.set(1, 0, 0, 1, i % 800, (i / 800) | 0)
        buffer.pushSpriteTransformed(matrix, 1, 64, 64, i % 800, (i / 800) | 0, 32, 32, 0, 0, 0, false, false)
      }
      buffer.isFrameActive = false
    })
    report('command buffer 20k sprites', ms)
    expect(buffer.getBufferView().commands.length).toBe(20_000)
    expect(ms).toBeLessThan(budget(15))
  })

  test('RenderCommandBuffer grows its buffers without quadratic copying', () => {
    const ms = measure(() => {
      const buffer = new RenderCommandBuffer(16, 16, 16, 16)
      buffer.beginFrame()
      for (let i = 0; i < 100_000; i++) buffer.pushRect(i, i, 4, 4, 255, 255, 255, 255)
      buffer.isFrameActive = false
    }, { warmup: 1, samples: 5 })
    report('command buffer growth 100k rects', ms)
    expect(ms).toBeLessThan(budget(30))
  })

  test('updates and renders a 5k-node scene tree within a frame budget', () => {
    const root = buildTree(50, 100)
    const buffer = new RenderCommandBuffer()
    SpriteLike.buffer = buffer
    const ms = measure(() => {
      root._updateTree(1 / 60)
      buffer.beginFrame()
      root._renderTree()
      buffer.isFrameActive = false
    })
    SpriteLike.buffer = null
    report('5k-node update+render', ms)
    expect(buffer.getBufferView().commands.length).toBe(5_000)
    expect(ms).toBeLessThan(budget(16))
  })

  test('collision broadphase scales sub-quadratically', () => {
    const small = buildColliders(250)
    const large = buildColliders(1000)
    let frame = 0
    const smallMs = measure(() => stepColliders(small, frame++))
    const largeMs = measure(() => stepColliders(large, frame++))
    report('collide 250', smallMs)
    report('collide 1000', largeMs)
    expect(largeMs).toBeLessThan(budget(16))
    // 4x the colliders: sweep-and-prune should cost ~4-6x, brute force 16x.
    // The floor keeps timer noise on very fast runs from failing the ratio.
    expect(largeMs).toBeLessThan(Math.max(smallMs, 0.25) * 10)
  })

  test('Tween.update advances 10k tweens per frame', () => {
    const targets = Array.from({ length: 10_000 }, () => ({ x: 0, y: 0 }))
    for (const target of targets) Tween.to(target, { x: 100, y: 50 }, 1e6)
    try {
      const ms = measure(() => Tween.update(1 / 60))
      report('10k tweens', ms)
      expect(targets[0].x).toBeGreaterThan(0)
      expect(ms).toBeLessThan(budget(10))
    } finally {
      Tween.stopAll()
    }
  })

  test('Matrix2D multiplies 1M times', () => {
    // A pure rotation keeps the product bounded across a million multiplies.
    const angle = 0.01
    const a = new Matrix2D(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 5, 5)
    const out = new Matrix2D()
    const ms = measure(() => {
      out.identity()
      for (let i = 0; i < 1_000_000; i++) out.multiply(a)
    }, { warmup: 1, samples: 5 })
    report('1M matrix multiplies', ms)
    expect(Number.isFinite(out.tx)).toBe(true)
    expect(ms).toBeLessThan(budget(60))
  })
})
