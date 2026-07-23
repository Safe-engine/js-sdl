import { ComponentX } from '../core/ComponentX'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import { CircleCollider, Collider } from './CollideComponent'
import { CollideSystem } from './CollideSystem'

export class ColliderDebugRender extends ComponentX {
  color: Color = { r: 110, g: 231, b: 255, a: 220 }

  onRenderEnd() {
    const collideSystem = this.node.getComponent(CollideSystem)
    if (!collideSystem?.debug) return
    for (const collider of collideSystem.colliders) {
      this.drawCollider(collider)
    }
  }

  drawCollider(collider: Collider) {
    if (collider instanceof CircleCollider) {
      globalCommandBuffer.pushCircle(
        collider.worldPosition.x,
        collider.worldPosition.y,
        collider.worldRadius,
        this.color.r,
        this.color.g,
        this.color.b,
        this.color.a,
      )
      return
    }
    globalCommandBuffer.pushPolyline(collider.worldPoints, this.color.r, this.color.g, this.color.b, this.color.a, true)
  }
}
