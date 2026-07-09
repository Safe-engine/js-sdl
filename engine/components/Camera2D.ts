import { ComponentX } from '../core/ComponentX'

export interface Camera2DProps {
  enabled?: boolean
  mask?: number
  priority?: number
  zoom?: number
}

export class Camera2D extends ComponentX<Camera2DProps> {
  enabled = true
  mask = 0xffffffff
  priority = 0
  zoom = 1

  onAwake(): void {
    this.enabled = this.props.enabled ?? true
    this.mask = this.props.mask ?? 0xffffffff
    this.priority = this.props.priority ?? 0
    this.zoom = this.props.zoom ?? 1
  }

  onRender(): void {}
}
