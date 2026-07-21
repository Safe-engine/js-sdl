import {
  Armature,
  BaseObject,
  EventObject,
  Slot,
  TextureAtlasData,
  TextureData,
  type Animation,
  type EventStringType,
  type IArmatureProxy,
  type Matrix,
} from 'dragonbones-es'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import type { TextureAsset } from '../AssetManager'
import { composeMatrix, composeRootMatrix, transformPoint } from './math'
import type { DragonBonesRenderRoot } from './types'

export class SdlTextureAtlasData extends TextureAtlasData {
  texture: TextureAsset | null = null

  static toString(): string {
    return '[class SdlTextureAtlasData]'
  }

  createTexture(): TextureData {
    return BaseObject.borrowObject(SdlTextureData)
  }

  protected _onClear(): void {
    super._onClear()
    this.texture?.release()
    this.texture = null
  }
}

export class SdlTextureData extends TextureData {
  static toString(): string {
    return '[class SdlTextureData]'
  }
}

export class SdlDisplay {
  textureData: SdlTextureData | null = null
  matrix: Matrix | null = null
  meshVertices: Float32Array | null = null
  meshUVs: Float32Array | null = null
  meshTriangles: Int16Array | null = null
  meshInArmatureSpace = false
  pivotX = 0
  pivotY = 0
  visible = true
  alpha = 1
  red = 255
  green = 255
  blue = 255
  zOrder = 0
}

export class SdlArmatureDisplay implements IArmatureProxy {
  private _armature: Armature | null = null
  private readonly listeners = new Map<EventStringType, Array<{ listener: Function, thisObject: any }>>()

  dbInit(armature: Armature): void {
    this._armature = armature
  }

  dbClear(): void {
    this.listeners.clear()
    this._armature = null
  }

  dbUpdate(): void {}

  dispose(disposeProxy: boolean): void {
    if (!disposeProxy) return
    this._armature?.dispose()
    this.dbClear()
  }

  hasDBEventListener(type: EventStringType): boolean {
    return (this.listeners.get(type)?.length ?? 0) > 0
  }

  dispatchDBEvent(type: EventStringType, eventObject: EventObject): void {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    for (const item of listeners) {
      item.listener.call(item.thisObject, eventObject)
    }
  }

  addDBEventListener(type: EventStringType, listener: Function, thisObject: any): void {
    const listeners = this.listeners.get(type) ?? []
    if (!listeners.some(item => item.listener === listener && item.thisObject === thisObject)) {
      listeners.push({ listener, thisObject })
    }
    this.listeners.set(type, listeners)
  }

  removeDBEventListener(type: EventStringType, listener: Function, thisObject: any): void {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    this.listeners.set(
      type,
      listeners.filter(item => item.listener !== listener || item.thisObject !== thisObject),
    )
  }

  get armature(): Armature {
    if (!this._armature) throw new Error('DragonBones armature display is not initialized.')
    return this._armature
  }

  get animation(): Animation {
    return this.armature.animation
  }
}

export class SdlSlot extends Slot {
  static toString(): string {
    return '[class SdlSlot]'
  }

  protected _initDisplay(_value: SdlDisplay, _isRetain: boolean): void {}
  protected _disposeDisplay(_value: SdlDisplay, _isRelease: boolean): void {}
  protected _onUpdateDisplay(): void {}
  protected _addDisplay(): void {}
  protected _replaceDisplay(_value: SdlDisplay): void {}
  protected _removeDisplay(): void {}

  protected _updateZOrder(): void {
    this.currentDisplay().zOrder = (this as any)._zOrder
  }

  _updateVisible(): void {
    this.currentDisplay().visible = (this as any)._visible
  }

  protected _updateBlendMode(): void {}

  protected _updateColor(): void {
    const display = this.currentDisplay()
    const color = (this as any)._colorTransform
    display.alpha = Math.max(0, Math.min(1, ((this as any)._globalAlpha ?? 1) * color.alphaMultiplier))
    display.red = Math.max(0, Math.min(255, 255 * color.redMultiplier + color.redOffset))
    display.green = Math.max(0, Math.min(255, 255 * color.greenMultiplier + color.greenOffset))
    display.blue = Math.max(0, Math.min(255, 255 * color.blueMultiplier + color.blueOffset))
  }

  protected _updateFrame(): void {
    const display = this.currentDisplay()
    display.textureData = ((this as any)._textureData ?? null) as SdlTextureData | null
    this.updateMeshData(display, false)
  }

  protected _updateMesh(): void {
    const display = this.currentDisplay()
    display.textureData = ((this as any)._textureData ?? null) as SdlTextureData | null
    this.updateMeshData(display, true)
  }

  protected _updateTransform(): void {
    const display = this.currentDisplay()
    display.matrix = this.globalTransformMatrix
    display.pivotX = (this as any)._pivotX
    display.pivotY = (this as any)._pivotY
  }

  protected _identityTransform(): void {
    const display = this.currentDisplay()
    display.matrix = null
    display.pivotX = 0
    display.pivotY = 0
  }

  render(root: DragonBonesRenderRoot): void {
    const display = this.currentDisplay()
    const textureData = display.textureData
    const texture = (textureData?.parent as SdlTextureAtlasData | undefined)?.texture
    if (!display.visible || !textureData || !texture) return

    const region = textureData.region
    if (display.meshVertices && display.meshUVs && display.meshTriangles) {
      this.renderMesh(root, display, texture.id)
      return
    }
    if (!display.matrix) return

    const sourceWidth = textureData.rotated ? region.height : region.width
    const sourceHeight = textureData.rotated ? region.width : region.height
    const matrix = composeMatrix(root, display.matrix)
    const scaleX = Math.hypot(matrix.a, matrix.b)
    const scaleY = Math.hypot(matrix.c, matrix.d)
    const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
    const width = sourceWidth * scaleX
    const height = sourceHeight * scaleY
    const centerX = display.pivotX * scaleX
    const centerY = display.pivotY * scaleY

    globalCommandBuffer.pushRegion(
      texture.id,
      region.x,
      region.y,
      region.width,
      region.height,
      matrix.tx - centerX,
      matrix.ty - centerY,
      width,
      height,
      rotation,
      centerX,
      centerY,
      false,
      false,
      display.red,
      display.green,
      display.blue,
      root.node.opacity * display.alpha * 255,
    )
  }

  private currentDisplay(): SdlDisplay {
    return (((this as any)._display ?? (this as any)._rawDisplay) as SdlDisplay)
  }

  private updateMeshData(display: SdlDisplay, updateVertices: boolean): void {
    const geometry = (this as any)._geometryData
    const textureData = display.textureData
    if (!geometry || !textureData) {
      display.meshVertices = null
      display.meshUVs = null
      display.meshTriangles = null
      display.meshInArmatureSpace = false
      return
    }

    const intArray = geometry.data.intArray as Int16Array
    const floatArray = geometry.data.floatArray as Float32Array
    const vertexCount = intArray[geometry.offset]
    const triangleCount = intArray[geometry.offset + 1]
    const floatOffset = intArray[geometry.offset + 2]
    const indexOffset = geometry.offset + 4
    const vertexLength = vertexCount * 2
    const triangleLength = triangleCount * 3

    if (!display.meshVertices || display.meshVertices.length !== vertexLength) {
      display.meshVertices = new Float32Array(vertexLength)
    }
    if (!display.meshUVs || display.meshUVs.length !== vertexLength) {
      display.meshUVs = new Float32Array(vertexLength)
    }
    this.copyMeshUVs(display.meshUVs, floatArray, floatOffset + vertexLength, vertexCount, textureData)
    if (!display.meshTriangles || display.meshTriangles.length !== triangleLength) {
      display.meshTriangles = new Int16Array(triangleLength)
      for (let i = 0; i < triangleLength; i++) {
        display.meshTriangles[i] = intArray[indexOffset + i]
      }
    }

    if (!updateVertices) return

    const deformVertices = ((this as any)._displayFrame?.deformVertices ?? []) as number[]
    const weight = geometry.weight
    display.meshInArmatureSpace = weight !== null

    if (weight) {
      const weightOffset = weight.offset
      const weightFloatOffset = intArray[weightOffset + 1]
      let boneIndexOffset = weightOffset + 2 + weight.bones.length
      let weightedVertexOffset = weightFloatOffset
      let deformOffset = 0

      for (let i = 0; i < vertexLength; i += 2) {
        const boneCount = intArray[boneIndexOffset++]
        let x = 0
        let y = 0

        for (let j = 0; j < boneCount; j++) {
          const boneIndex = intArray[boneIndexOffset++]
          const bone = (this as any)._geometryBones[boneIndex]
          const matrix = bone?.globalTransformMatrix
          const weightValue = floatArray[weightedVertexOffset++]
          const vx = floatArray[weightedVertexOffset++] + (deformVertices[deformOffset++] ?? 0)
          const vy = floatArray[weightedVertexOffset++] + (deformVertices[deformOffset++] ?? 0)
          if (!matrix) continue

          x += (matrix.a * vx + matrix.c * vy + matrix.tx) * weightValue
          y += (matrix.b * vx + matrix.d * vy + matrix.ty) * weightValue
        }

        display.meshVertices[i] = x
        display.meshVertices[i + 1] = y
      }
    } else {
      for (let i = 0; i < vertexLength; i++) {
        display.meshVertices[i] = floatArray[floatOffset + i] + (deformVertices[i] ?? 0)
      }
    }
  }

  private copyMeshUVs(
    target: Float32Array,
    floatArray: Float32Array,
    uvOffset: number,
    vertexCount: number,
    textureData: SdlTextureData,
  ): void {
    const atlas = textureData.parent as SdlTextureAtlasData | null
    const texture = atlas?.texture
    const region = textureData.region
    const width = texture?.width || 1
    const height = texture?.height || 1

    for (let i = 0; i < vertexCount; i++) {
      const source = uvOffset + i * 2
      const targetIndex = i * 2
      target[targetIndex] = (region.x + floatArray[source] * region.width) / width
      target[targetIndex + 1] = (region.y + floatArray[source + 1] * region.height) / height
    }
  }

  private renderMesh(root: DragonBonesRenderRoot, display: SdlDisplay, textureId: number): void {
    const vertices = display.meshVertices
    const uvs = display.meshUVs
    const triangles = display.meshTriangles
    if (!vertices || !uvs || !triangles) return

    const matrix = display.meshInArmatureSpace
      ? composeRootMatrix(root)
      : (display.matrix ? composeMatrix(root, display.matrix) : null)
    if (!matrix) return

    for (let i = 0; i < triangles.length; i += 3) {
      const i0 = triangles[i] * 2
      const i1 = triangles[i + 1] * 2
      const i2 = triangles[i + 2] * 2
      const p0 = transformPoint(matrix, vertices[i0], vertices[i0 + 1])
      const p1 = transformPoint(matrix, vertices[i1], vertices[i1 + 1])
      const p2 = transformPoint(matrix, vertices[i2], vertices[i2 + 1])

      globalCommandBuffer.pushQuad(
        textureId,
        p0.x,
        p0.y,
        uvs[i0],
        uvs[i0 + 1],
        p1.x,
        p1.y,
        uvs[i1],
        uvs[i1 + 1],
        p2.x,
        p2.y,
        uvs[i2],
        uvs[i2 + 1],
        p2.x,
        p2.y,
        uvs[i2],
        uvs[i2 + 1],
        display.red,
        display.green,
        display.blue,
        display.alpha * 255,
      )
    }
  }
}
