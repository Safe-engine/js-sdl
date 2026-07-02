export function Vec2(x = 0, y = 0): Vec2 {
  return { x, y }
}

export function Size(width = 0, height = 0): Size {
  return { width, height }
}

export function Rect(x = 0, y = 0, width = 0, height = 0): Rect {
  return { x, y, width, height }
}

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export function Color4B(r: number, g: number, b: number, a: number): Color {
  return { r, g, b, a }
}
