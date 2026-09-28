import { ComponentX } from '../core/ComponentX'
import type { Node } from '../core/Node'
import { Matrix2D } from '../math/Matrix2D'

export interface Camera2DProps {
  enabled?: boolean
  mask?: number
  priority?: number
  zoom?: number
}

/** Every camera attached to a node and not yet destroyed, in creation order. */
const cameras = new Set<Camera2D>()

function isActiveUnder(node: Node, root: Node): boolean {
  for (let current: Node | null = node; current; current = current.parent) {
    if (!current.active) return false
    if (current === root) return true
  }
  return false
}

export class Camera2D extends ComponentX<Camera2DProps> {
  /**
   * Engine-internal: enabled cameras under active nodes of `root`, sorted by
   * priority (ties keep creation order). Avoids walking the scene tree.
   */
  static _collectActive(root: Node): Camera2D[] {
    const active: Camera2D[] = []
    for (const camera of cameras) {
      if (camera.enabled && camera.node && isActiveUnder(camera.node, root)) {
        active.push(camera)
      }
    }
    return active.sort((a, b) => a.priority - b.priority)
  }

  mask = 0xffffffff
  priority = 0
  zoom = 1

  readonly viewMatrix = new Matrix2D()
  private readonly _invViewMatrix = new Matrix2D()

  onAwake(): void {
    this.enabled = this.props.enabled ?? true
    this.mask = this.props.mask ?? 0xffffffff
    this.priority = this.props.priority ?? 0
    this.zoom = this.props.zoom ?? 1
    cameras.add(this)
  }

  onDestroy(): void {
    cameras.delete(this)
  }

  onRender(): void {}

  /**
   * Calculates and returns the 2D view matrix for this camera.
   */
  getViewMatrix(viewportWidth?: number, viewportHeight?: number, out?: Matrix2D): Matrix2D {
    const target = out ?? this.viewMatrix
    const root = this.node?.root
    const vpW = viewportWidth ?? root?.width ?? 0
    const vpH = viewportHeight ?? root?.height ?? 0
    const centerX = vpW * 0.5
    const centerY = vpH * 0.5

    const cx = this.node.worldX
    const cy = this.node.worldY
    const rad = (this.node.worldRotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const a = this.zoom * cos
    const c = this.zoom * sin
    const b = -this.zoom * sin
    const d = this.zoom * cos

    const tx = centerX - (cx * a + cy * c)
    const ty = centerY - (cx * b + cy * d)

    target.set(a, b, c, d, tx, ty)
    return target
  }

  /**
   * Converts a scene world coordinate into screen/viewport space.
   */
  worldToScreen(worldX: number, worldY: number, viewportWidth?: number, viewportHeight?: number): { x: number, y: number } {
    const vm = this.getViewMatrix(viewportWidth, viewportHeight)
    return vm.transformPoint(worldX, worldY)
  }

  /**
   * Converts a screen/viewport coordinate back into scene world space.
   */
  screenToWorld(screenX: number, screenY: number, viewportWidth?: number, viewportHeight?: number): { x: number, y: number } {
    const vm = this.getViewMatrix(viewportWidth, viewportHeight)
    vm.invert(this._invViewMatrix)
    return this._invViewMatrix.transformPoint(screenX, screenY)
  }
}
