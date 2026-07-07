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

export function randomRangeInt(minInclude: Integer, maxExclude: Integer) {
  return Math.round(Math.random() * (maxExclude - minInclude - 1)) + minInclude
}
export function randomRange(minInclude: Float, maxExclude: Float) {
  return Math.random() * (maxExclude - minInclude - 1) + minInclude
}

export function getMin(arr: number[]): number | null {
  if (arr.length === 0) return null

  let min = arr[0]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) {
      min = arr[i]
    }
  }
  return min
}

export function getMax(arr: number[]): number | null {
  if (arr.length === 0) return null

  let max = arr[0]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i]
    }
  }
  return max
}
