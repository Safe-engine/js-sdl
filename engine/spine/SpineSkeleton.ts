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
import { drawTextureQuad } from 'sdl3'
import type { TextureAsset } from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
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

  onStart(): void {
    void this.reload().catch((error) => {
      console.error('Spine reload failed', error)
    })
  }

  onUpdate(dt: number): void {
    if (!this.skeleton || !this.state) return
    this.state.timeScale = this.props.timeScale ?? 1
    this.state.update(dt)
    this.state.apply(this.skeleton)
    this.skeleton.update(dt)
    this.skeleton.updateWorldTransform(Physics.update)
  }

  onRender(): void {
    if (!this.node?.visible || !this.skeleton) return

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
        this.renderRegion(attachment, slot, texture.asset)
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
        this.renderMesh(attachment, slot, texture.asset)
      }
    }
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

  private renderRegion(
    attachment: RegionAttachment,
    slot: any,
    texture: TextureAsset,
  ): void {
    const vertices = this.worldVertices
    const uvs = attachment.uvs
    const bottomRight = transformPoint(this, vertices[0], vertices[1])
    const bottomLeft = transformPoint(this, vertices[2], vertices[3])
    const topLeft = transformPoint(this, vertices[4], vertices[5])
    const topRight = transformPoint(this, vertices[6], vertices[7])

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

    drawTextureQuad(
      texture.id,
      topLeft.x,
      topLeft.y,
      uvs[4],
      uvs[5],
      topRight.x,
      topRight.y,
      uvs[6],
      uvs[7],
      bottomLeft.x,
      bottomLeft.y,
      uvs[2],
      uvs[3],
      bottomRight.x,
      bottomRight.y,
      uvs[0],
      uvs[1],
      red,
      green,
      blue,
      alpha,
    )
  }

  private renderMesh(
    attachment: MeshAttachment,
    slot: any,
    texture: TextureAsset,
  ): void {
    const vertices = this.worldVertices
    const uvs = attachment.uvs
    const color = this.multiplyColors(slot.color, attachment.color)
    const triangles = attachment.triangles

    for (let i = 0; i < triangles.length; i += 3) {
      const i0 = triangles[i] * 2
      const i1 = triangles[i + 1] * 2
      const i2 = triangles[i + 2] * 2
      const p0 = transformPoint(this, vertices[i0], vertices[i0 + 1])
      const p1 = transformPoint(this, vertices[i1], vertices[i1 + 1])
      const p2 = transformPoint(this, vertices[i2], vertices[i2 + 1])

      drawTextureQuad(
        texture.id,
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
        color.red,
        color.green,
        color.blue,
        color.alpha,
      )
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

function transformPoint(root: SpineSkeleton, x: number, y: number): { x: number, y: number } {
  const node = root.node
  if (!node) return { x, y }

  const radians = node.worldRotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const scaledX = x * node.worldScaleX
  const scaledY = y * node.worldScaleY
  return {
    x: node.worldX + scaledX * cos - scaledY * sin,
    y: node.worldY + scaledX * sin + scaledY * cos,
  }
}
