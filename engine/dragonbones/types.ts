export interface DragonBonesData {
  atlas: string
  skeleton: string
  texture: string
}

export interface DragonBonesProps {
  data: DragonBonesData
  skin?: string
  animation?: string
  playTimes?: Integer
  timeScale?: Float

  onAnimationStart?: (animationName?: string) => void
  onAnimationEnd?: (animationName?: string) => void
  onAnimationComplete?: (animationName?: string, loopCount?: number) => void
}

export interface LoadedDragonBonesData {
  key: string
  skeleton: any
  atlas: any
  texture: import('../AssetManager').TextureAsset
}

export interface DragonBonesRenderNode {
  opacity: number
  worldRotation: number
  worldScaleX: number
  worldScaleY: number
  worldX: number
  worldY: number
}

export interface DragonBonesRenderRoot {
  node: DragonBonesRenderNode
}
