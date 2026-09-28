/**
 * Engine workloads shared by the Bun performance tests and the on-device
 * benchmark bundle (device-bench.ts), so both measure exactly the same code.
 * Only engine modules are imported: no Bun APIs, no rendering backend.
 */
import { Tween } from '../../engine/animation/Tween'
import { BoxCollider, CircleCollider, CollideSystem } from '../../engine/collider'
import { setActiveCamera } from '../../engine/core/CameraRenderContext'
import { ComponentX } from '../../engine/core/ComponentX'
import { Node } from '../../engine/core/Node'
import { Matrix2D } from '../../engine/math/Matrix2D'
import { RenderCommandBuffer } from '../../engine/render/RenderCommandBuffer'
import { seededRandom } from './perf-utils'

export interface Workload {
  name: string
  run(): void
  /** Sanity check that `run` did real work. */
  verify(): boolean
  warmup?: number
  samples?: number
  dispose?(): void
}

class SpriteLike extends ComponentX {
  static buffer: RenderCommandBuffer | null = null
  override onRender(): void {
    const node = this.node
    SpriteLike.buffer!.pushSpriteTransformed(
      node.renderMatrix, 1, 64, 64, 0, 0, node.width, node.height, 0, 0, 0, false, false,
    )
  }
}

/** Reads the render transform the way Sprite.onRender does. */
class CameraSpriteLike extends ComponentX {
  override onRender(): void {
    const node = this.node
    const w = node.width * node.renderScaleX
    const h = node.height * node.renderScaleY
    SpriteLike.buffer!.pushSpriteTransformed(
      node.renderMatrix, 1, 64, 64,
      node.renderX - node.anchorX * w, node.renderY - node.anchorY * h, w, h,
      node.renderRotation, node.anchorX * w, node.anchorY * h, false, false,
    )
  }
}

class Spinner extends ComponentX {
  override onUpdate(dt: number): void {
    this.node.rotation += dt * 90
  }
}

/** A root with `groups` children of `perGroup` leaves, every leaf drawing a sprite. */
function buildTree(groups: number, perGroup: number, sprite: typeof ComponentX = SpriteLike): Node {
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
      leaf.addComponent(sprite)
    }
  }
  root._startTree()
  return root
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

export function commandBufferSprites(count = 20_000): Workload {
  const buffer = new RenderCommandBuffer()
  const matrix = new Matrix2D()
  return {
    name: `command buffer ${count} sprites`,
    run() {
      buffer.beginFrame()
      for (let i = 0; i < count; i++) {
        matrix.set(1, 0, 0, 1, i % 800, (i / 800) | 0)
        buffer.pushSpriteTransformed(matrix, 1, 64, 64, i % 800, (i / 800) | 0, 32, 32, 0, 0, 0, false, false)
      }
      buffer.isFrameActive = false
    },
    verify: () => buffer.getBufferView().commands.length === count,
  }
}

export function commandBufferGrowth(count = 100_000): Workload {
  let buffer: RenderCommandBuffer | null = null
  return {
    name: `command buffer growth ${count} rects`,
    warmup: 1,
    samples: 5,
    run() {
      buffer = new RenderCommandBuffer(16, 16, 16, 16)
      buffer.beginFrame()
      for (let i = 0; i < count; i++) buffer.pushRect(i, i, 4, 4, 255, 255, 255, 255)
      buffer.isFrameActive = false
    },
    verify: () => buffer?.getBufferView().commands.length === count,
  }
}

export function sceneTree(groups = 50, perGroup = 100): Workload {
  const root = buildTree(groups, perGroup)
  const buffer = new RenderCommandBuffer()
  return {
    name: `${groups * perGroup}-node update+render`,
    run() {
      SpriteLike.buffer = buffer
      root._updateTree(1 / 60)
      buffer.beginFrame()
      root._renderTree()
      buffer.isFrameActive = false
      SpriteLike.buffer = null
    },
    verify: () => buffer.getBufferView().commands.length === groups * perGroup,
    dispose: () => root.destroy(),
  }
}

/** Like sceneTree, rendered through a camera pass as Scene.render does. */
export function cameraSceneTree(groups = 50, perGroup = 100): Workload {
  const root = buildTree(groups, perGroup, CameraSpriteLike)
  const buffer = new RenderCommandBuffer()
  const viewMatrix = new Matrix2D(1.25, 0, 0, 1.25, -40, 30)
  return {
    name: `${groups * perGroup}-node update+render with camera`,
    run() {
      SpriteLike.buffer = buffer
      root._updateTree(1 / 60)
      buffer.beginFrame()
      setActiveCamera({ viewMatrix, mask: 0xffffffff })
      try {
        root._renderTree()
      } finally {
        setActiveCamera(null)
      }
      buffer.isFrameActive = false
      SpriteLike.buffer = null
    },
    verify: () => buffer.getBufferView().commands.length === groups * perGroup,
    dispose: () => root.destroy(),
  }
}

export function colliders(count: number): Workload {
  const root = buildColliders(count)
  let frame = 0
  return {
    name: `collide ${count}`,
    // Moves every collider a little so each frame does real broadphase work.
    run() {
      const children = root.children
      for (let i = 0; i < children.length; i++) {
        children[i].x += ((i + frame) % 3) - 1
        children[i].y += ((i * 7 + frame) % 3) - 1
      }
      frame++
      root._updateTree(1 / 60)
    },
    verify: () => frame > 0,
    dispose: () => root.destroy(),
  }
}

export function tweens(count = 10_000): Workload {
  const targets = Array.from({ length: count }, () => ({ x: 0, y: 0 }))
  for (const target of targets) Tween.to(target, { x: 100, y: 50 }, 1e6)
  return {
    name: `${count} tweens`,
    run: () => Tween.update(1 / 60),
    verify: () => targets[0].x > 0,
    dispose: () => Tween.stopAll(),
  }
}

export function matrixMultiply(count = 1_000_000): Workload {
  // A pure rotation keeps the product bounded across a million multiplies.
  const angle = 0.01
  const a = new Matrix2D(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 5, 5)
  const out = new Matrix2D()
  return {
    name: `${count} matrix multiplies`,
    warmup: 1,
    samples: 5,
    run() {
      out.identity()
      for (let i = 0; i < count; i++) out.multiply(a)
    },
    verify: () => Number.isFinite(out.tx),
  }
}
