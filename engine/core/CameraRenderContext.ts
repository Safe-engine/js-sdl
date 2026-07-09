export interface CameraRenderState {
  x: number
  y: number
  rotation: number
  zoom: number
  centerX: number
  centerY: number
  mask: number
}

let activeCamera: CameraRenderState | null = null

export function getActiveCamera(): CameraRenderState | null {
  return activeCamera
}

export function setActiveCamera(camera: CameraRenderState | null): void {
  activeCamera = camera
}
