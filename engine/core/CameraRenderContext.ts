import type { Camera2D } from '../components/Camera2D'
import type { Matrix2D } from '../math/Matrix2D'

export interface CameraRenderState {
  viewMatrix: Matrix2D
  mask: number
  camera?: Camera2D
  x?: number
  y?: number
  rotation?: number
  zoom?: number
  centerX?: number
  centerY?: number
}

let activeCamera: CameraRenderState | null = null

export function getActiveCamera(): CameraRenderState | null {
  return activeCamera
}

export function setActiveCamera(camera: CameraRenderState | null): void {
  activeCamera = camera
}
