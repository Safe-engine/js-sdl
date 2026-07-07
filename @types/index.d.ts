type Integer = number
type Float = number

interface Size {
  width: Float
  height: Float
}
interface Vec2 {
  x: Float
  y: Float
}
declare type Point = Vec2

interface Rect {
  x: number
  y: number
  width: number
  height: number
}
declare type TextureRegion = Rect

interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

interface Color {
  r: number
  g: number
  b: number
  a?: number
}
