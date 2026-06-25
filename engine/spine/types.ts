export interface SpineData {
  atlas: string
  skeleton: string
  texture?: string
}

export interface SpineSkeletonProps {
  data: SpineData
  skin?: string
  animation?: string
  timeScale?: number
  loop?: boolean
  onAnimationComplete?: (animationName?: string, loopCount?: number) => void
}
