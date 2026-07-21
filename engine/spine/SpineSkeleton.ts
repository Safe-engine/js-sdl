import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  MeshAttachment,
  Physics,
  RegionAttachment,
  Skeleton,
  SkeletonBinary,
  SkeletonJson,
  type TextureRegion,
  type TrackEntry,
} from '@esotericsoftware/spine-core'
import type { TextureAsset } from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import { loadSpineData } from './loadSpineData'
import { SdlSpineTexture } from './SdlSpineTexture'
import type { SpineData, SpineSkeletonProps } from './types'

export class SpineSkeleton extends ComponentX<SpineSkeletonProps> {
  skeleton: Skeleton
  private state: AnimationState | null = null
  private textures: SdlSpineTexture[] = []
  private loadedKey = ''
  private loadVersion = 0
  private worldVertices = new Float32Array(8)
  private readonly meshUvs = new WeakMap<MeshAttachment, Float32Array>()
  private readonly meshIndices = new WeakMap<MeshAttachment, Uint16Array>()
  private batchTexture: TextureAsset | null = null
  private batchColor: { red: number, green: number, blue: number, alpha: number } | null = null
  private batchPositions = new Float32Array(0)
  private batchUvs = new Float32Array(0)
  private batchIndices = new Uint16Array(0)
  private batchVertexCount = 0
  private batchIndexCount = 0
  private renderTransform: SpineTransform = IDENTITY_TRANSFORM

  onStart(): void {
    void this.reload().catch((error) => {
      console.error('Spine reload failed', error)
    })
  }

  onUpdate(dt: number): void {
    if (!this.skeleton || !this.state) return
    if (!this.state.getCurrent(0)) return
    this.state.timeScale = this.props.timeScale ?? 1
    this.state.update(dt)
    this.state.apply(this.skeleton)
    this.skeleton.update(dt)
    this.skeleton.updateWorldTransform(Physics.update)
  }

  onRender(): void {
    if (!this.node?.visible || !this.skeleton) return

    this.resetBatch()
    this.renderTransform = getTransform(this)
    const drawOrder = this.skeleton.drawOrder
    for (let i = 0; i < drawOrder.length; i++) {
      const slot = drawOrder[i]
      const attachment = slot.getAttachment()
      if (!slot.bone.active) continue

      if (attachment instanceof RegionAttachment) {
        attachment.computeWorldVertices(
          slot,
          this.worldVertices,
          0,
          2,
        )
        const region = attachment.region as TextureRegion | null
        const texture = region?.texture as SdlSpineTexture | null | undefined
        if (!region || !texture) continue
        this.appendRegion(attachment, slot, texture.asset)
      } else if (attachment instanceof MeshAttachment) {
        const vertices = this.ensureWorldVertices(attachment.worldVerticesLength)
        attachment.computeWorldVertices(
          slot,
          0,
          attachment.worldVerticesLength,
          vertices,
          0,
          2,
        )
        const region = attachment.region as TextureRegion | null
        const texture = region?.texture as SdlSpineTexture | null | undefined
        if (!region || !texture) continue
        this.appendMesh(attachment, slot, texture.asset)
      }
    }
    this.flushBatch()
  }

  onDestroy(): void {
    this.disposeSkeleton()
  }

  setSkeletonData(data: SpineData) {
    this.props.data = data
    this.reload()
  }

  async reload(): Promise<void> {
    const data = this.props.data
    if (!data) return

    const version = ++this.loadVersion
    const loaded = await loadSpineData(data)
    if (version !== this.loadVersion) {
      loaded.atlas.dispose()
      return
    }

    this.disposeSkeleton()
    this.loadedKey = loaded.key
    this.textures = loaded.textures

    Skeleton.yDown = true
    const loader = new AtlasAttachmentLoader(loaded.atlas)
    const parser = loaded.skeleton instanceof ArrayBuffer
      ? new SkeletonBinary(loader)
      : new SkeletonJson(loader)
    const skeletonData = parser.readSkeletonData(loaded.skeleton)

    this.skeleton = new Skeleton(skeletonData)
    if (this.props.skin) this.skeleton.setSkinByName(this.props.skin)
    this.skeleton.setToSetupPose()

    this.state = new AnimationState(new AnimationStateData(skeletonData))
    this.state.addListener({
      complete: (entry: TrackEntry) => {
        this.props.onAnimationComplete?.call(
          this,
          entry.animation?.name,
          Math.floor(entry.trackTime / Math.max(entry.animationEnd - entry.animationStart, 1e-6)),
        )
      },
    })
    this.play(this.props.animation, this.props.loop)

    this.state.apply(this.skeleton)
    this.skeleton.updateWorldTransform(Physics.update)
  }

  play(animation = this.props.animation, loop = this.props.loop): void {
    if (!this.state || !animation) return
    this.state.setAnimation(0, animation, loop ?? true)
  }

  private appendRegion(
    attachment: RegionAttachment,
    slot: any,
    texture: TextureAsset,
  ): void {
    const vertices = this.worldVertices
    const uvs = attachment.uvs
    const skeletonColor = this.skeleton?.color
    const slotColor = slot.color
    const attachmentColor = attachment.color
    const red = 255 * (skeletonColor?.r ?? 1) * slotColor.r * attachmentColor.r
    const green = 255 * (skeletonColor?.g ?? 1) * slotColor.g * attachmentColor.g
    const blue = 255 * (skeletonColor?.b ?? 1) * slotColor.b * attachmentColor.b
    const alpha = 255
      * (skeletonColor?.a ?? 1)
      * slotColor.a
      * attachmentColor.a
      * (this.node?.opacity ?? 1)

    this.appendToBatch(texture, { red, green, blue, alpha }, [
      vertices[4], vertices[5],
      vertices[6], vertices[7],
      vertices[2], vertices[3],
      vertices[0], vertices[1],
    ], [
      uvs[4], uvs[5],
      uvs[6], uvs[7],
      uvs[2], uvs[3],
      uvs[0], uvs[1],
    ], QUAD_INDICES)
  }

  private appendMesh(
    attachment: MeshAttachment,
    slot: any,
    texture: TextureAsset,
  ): void {
    const vertices = this.worldVertices
    const color = this.multiplyColors(slot.color, attachment.color)
    const indices = this.getMeshIndices(attachment)
    if (!indices) return
    this.appendToBatch(texture, color, vertices, this.getMeshUvs(attachment), indices)
  }

  private resetBatch(): void {
    this.batchTexture = null
    this.batchColor = null
    this.batchVertexCount = 0
    this.batchIndexCount = 0
  }

  private appendToBatch(
    texture: TextureAsset,
    color: { red: number, green: number, blue: number, alpha: number },
    positions: ArrayLike<number>,
    uvs: ArrayLike<number>,
    indices: ArrayLike<number>,
  ): void {
    if (this.batchTexture && (this.batchTexture !== texture || !sameColor(this.batchColor!, color))) {
      this.flushBatch()
    }

    const vertexCount = positions.length / 2
    if (!Number.isInteger(vertexCount) || uvs.length !== positions.length || vertexCount > 0xffff) return
    if (this.batchVertexCount + vertexCount > 0xffff) this.flushBatch()
    this.ensureBatchCapacity(this.batchVertexCount + vertexCount, this.batchIndexCount + indices.length)
    const vertexOffset = this.batchVertexCount
    this.batchPositions.set(positions, vertexOffset * 2)
    this.batchUvs.set(uvs, vertexOffset * 2)
    for (let i = 0; i < indices.length; i++) {
      this.batchIndices[this.batchIndexCount + i] = indices[i] + vertexOffset
    }
    this.batchTexture = texture
    this.batchColor = color
    this.batchVertexCount += vertexCount
    this.batchIndexCount += indices.length
  }

  private flushBatch(): void {
    if (!this.batchTexture || !this.batchColor || this.batchIndexCount === 0) return
    const transform = this.renderTransform
    globalCommandBuffer.pushMesh(
      this.batchTexture.id,
      this.batchPositions.subarray(0, this.batchVertexCount * 2),
      this.batchUvs.subarray(0, this.batchVertexCount * 2),
      this.batchIndices.subarray(0, this.batchIndexCount),
      this.batchColor.red,
      this.batchColor.green,
      this.batchColor.blue,
      this.batchColor.alpha,
      transform.x,
      transform.y,
      transform.scaleX,
      transform.scaleY,
      transform.cos,
      transform.sin,
    )
    this.resetBatch()
  }

  private ensureBatchCapacity(vertices: number, indices: number): void {
    if (this.batchPositions.length < vertices * 2) {
      const positions = new Float32Array(nextCapacity(this.batchPositions.length, vertices * 2))
      const uvs = new Float32Array(positions.length)
      positions.set(this.batchPositions)
      uvs.set(this.batchUvs)
      this.batchPositions = positions
      this.batchUvs = uvs
    }
    if (this.batchIndices.length < indices) {
      const nextIndices = new Uint16Array(nextCapacity(this.batchIndices.length, indices))
      nextIndices.set(this.batchIndices)
      this.batchIndices = nextIndices
    }
  }

  private disposeSkeleton(): void {
    this.loadVersion++
    this.state?.clearListeners()
    this.state?.clearTracks()
    this.state = null
    this.skeleton = null
    if (this.loadedKey) {
      for (const texture of this.textures) texture.dispose()
    }
    this.textures = []
    this.loadedKey = ''
  }

  private ensureWorldVertices(length: number): Float32Array {
    if (this.worldVertices.length < length) {
      this.worldVertices = new Float32Array(length)
    }
    return this.worldVertices
  }

  private getMeshUvs(attachment: MeshAttachment): Float32Array {
    let uvs = this.meshUvs.get(attachment)
    if (!uvs) {
      uvs = new Float32Array(attachment.uvs)
      this.meshUvs.set(attachment, uvs)
    }
    return uvs
  }

  private getMeshIndices(attachment: MeshAttachment): Uint16Array | null {
    let indices = this.meshIndices.get(attachment)
    if (indices) return indices
    const triangles = attachment.triangles
    if (triangles.length % 3 !== 0 || attachment.worldVerticesLength / 2 > 0xffff) return null
    indices = new Uint16Array(triangles)
    this.meshIndices.set(attachment, indices)
    return indices
  }

  private multiplyColors(
    slotColor: { r: number, g: number, b: number, a: number },
    attachmentColor: { r: number, g: number, b: number, a: number },
  ): { red: number, green: number, blue: number, alpha: number } {
    const skeletonColor = this.skeleton?.color
    return {
      red: 255 * (skeletonColor?.r ?? 1) * slotColor.r * attachmentColor.r,
      green: 255 * (skeletonColor?.g ?? 1) * slotColor.g * attachmentColor.g,
      blue: 255 * (skeletonColor?.b ?? 1) * slotColor.b * attachmentColor.b,
      alpha: 255
        * (skeletonColor?.a ?? 1)
        * slotColor.a
        * attachmentColor.a
        * (this.node?.opacity ?? 1),
    }
  }
}

const QUAD_INDICES = new Uint16Array([0, 1, 2, 2, 1, 3])

function sameColor(
  left: { red: number, green: number, blue: number, alpha: number },
  right: { red: number, green: number, blue: number, alpha: number },
): boolean {
  return left.red === right.red && left.green === right.green
    && left.blue === right.blue && left.alpha === right.alpha
}

function nextCapacity(current: number, required: number): number {
  return Math.max(required, current === 0 ? 64 : current * 2)
}

interface SpineTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  cos: number
  sin: number
}

const IDENTITY_TRANSFORM: SpineTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  cos: 1,
  sin: 0,
}

function getTransform(root: SpineSkeleton): SpineTransform {
  const node = root.node
  if (!node) return { x: 0, y: 0, scaleX: 1, scaleY: 1, cos: 1, sin: 0 }
  const radians = node.worldRotation * Math.PI / 180
  return {
    x: node.worldX,
    y: node.worldY,
    scaleX: node.worldScaleX,
    scaleY: node.worldScaleY,
    cos: Math.cos(radians),
    sin: Math.sin(radians),
  }
}
