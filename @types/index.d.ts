type Integer = number;
type Float = number;

interface Vec2 {
  x: Float;
  y: Float;
}
declare type Point = Vec2;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}