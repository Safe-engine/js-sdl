import type { Matrix } from 'dragonbones-es'
import type { DragonBonesRenderRoot } from './types'

export function composeMatrix(root: DragonBonesRenderRoot, local: Matrix): Matrix {
  const rootMatrix = composeRootMatrix(root)

  return {
    a: rootMatrix.a * local.a + rootMatrix.c * local.b,
    b: rootMatrix.b * local.a + rootMatrix.d * local.b,
    c: rootMatrix.a * local.c + rootMatrix.c * local.d,
    d: rootMatrix.b * local.c + rootMatrix.d * local.d,
    tx: rootMatrix.tx + rootMatrix.a * local.tx + rootMatrix.c * local.ty,
    ty: rootMatrix.ty + rootMatrix.b * local.tx + rootMatrix.d * local.ty,
  } as Matrix
}

export function composeRootMatrix(root: DragonBonesRenderRoot): Matrix {
  const node = root.node
  const radians = node.worldRotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const na = cos * node.worldScaleX
  const nb = sin * node.worldScaleX
  const nc = -sin * node.worldScaleY
  const nd = cos * node.worldScaleY

  return { a: na, b: nb, c: nc, d: nd, tx: node.worldX, ty: node.worldY } as Matrix
}

export function transformPoint(matrix: Matrix, x: number, y: number): { x: number, y: number } {
  return {
    x: matrix.a * x + matrix.c * y + matrix.tx,
    y: matrix.b * x + matrix.d * y + matrix.ty,
  }
}
