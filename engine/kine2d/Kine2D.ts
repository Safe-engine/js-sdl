import { AssetManager, type TextureAsset } from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { loadJsonAsset } from '../helper/resource-load'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'

export interface Kine2DProps {
  data: string | KineSkeletonData
  atlas: string | KineAtlasData
  texture?: string
  animation?: string
  loop?: boolean
}

export interface KineBone {
  name: string
  parent?: string
  x?: number
  y?: number
  rotation?: number
  scale?: number
  scaleX?: number
  scaleY?: number
}

interface KineAttachment {
  path: string
  size?: { width: number, height: number }
  x?: number
  y?: number
  rotation?: number
  scale?: number
  scaleX?: number
  scaleY?: number
}

interface KineSlot {
  id?: string
  name?: string
  bone: string
  attachment?: KineAttachment
  attachments?: KineAttachment[]
  displayIndex?: number
  activeAttachmentPath?: string | null
}

interface KineSlotState {
  attachment?: KineAttachment
  attachments?: KineAttachment[]
  displayIndex?: number
  activeAttachmentPath?: string | null
}

interface KineSkin {
  id: string
  attachments: Record<string, KineSlotState | KineAttachment | null>
}

interface KineKeyframe {
  x?: number
  y?: number
  rotation?: number
  scale?: number
  scaleX?: number
  scaleY?: number
}

interface KineAnimation {
  length?: number
  fps?: number
  keyframes: Record<string, Record<string, KineKeyframe>>
  slotOrderKeyframes?: Record<string, string[]>
  slotDisplayIndexKeyframes?: Record<string, Record<string, number>>
}

export interface KineSkeletonData {
  canvasSize?: { width: number, height: number }
  bones: KineBone[]
  slots: KineSlot[]
  skins?: KineSkin[]
  activeSkinId?: string
  animations: Record<string, KineAnimation>
}

export interface KineAtlasData {
  image: string
  regions: Array<{ path: string, x: number, y: number, width: number, height: number }>
}

type Pose = Required<Pick<KineBone, 'x' | 'y' | 'rotation'>> & KineBone

export class Kine2D extends ComponentX<Kine2DProps> {
  private skeleton: KineSkeletonData | null = null
  private atlas: KineAtlasData | null = null
  private texture: TextureAsset | null = null
  private elapsed = 0
  private loadVersion = 0

  onStart(): void {
    void this.reload().catch((error) => console.error('Kine2D load failed', error))
  }

  onUpdate(dt: number): void {
    const animation = this.animation
    const length = animation?.length ?? 0
    const fps = animation?.fps ?? 0
    if (length <= 0 || fps <= 0) return

    this.elapsed += dt
    const duration = length / fps
    if (this.props.loop ?? true) this.elapsed %= duration
    else this.elapsed = Math.min(this.elapsed, duration)
  }

  onRender(): void {
    const skeleton = this.skeleton
    const atlas = this.atlas
    const texture = this.texture
    if (!this.node.visible || !skeleton || !atlas || !texture) return

    const pose = this.samplePose()
    const regions = new Map(atlas.regions.map(region => [region.path, region]))
    const canvasSize = skeleton.canvasSize ?? { width: 800, height: 600 }
    const node = this.node
    const opacity = node.opacity * (node.color.a ?? 255)
    const radians = node.worldRotation * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)

    for (const slot of this.sampleSlots()) {
      const attachment = this.resolveAttachment(slot)
      const bone = pose.get(slot.bone)
      const region = attachment && regions.get(attachment.path)
      if (!attachment || !bone || !region) continue
      const size = attachment.size ?? { width: region.width, height: region.height }

      const attachmentScaleX = attachment.scaleX ?? attachment.scale ?? 1
      const attachmentScaleY = attachment.scaleY ?? attachment.scale ?? 1
      const attachmentX = attachment.x ?? 0
      const attachmentY = attachment.y ?? 0
      const scaleX = (bone.scaleX ?? bone.scale ?? 1) * attachmentScaleX
      const scaleY = (bone.scaleY ?? bone.scale ?? 1) * attachmentScaleY
      const rotation = bone.rotation + (attachment.rotation ?? 0)
      const boneRadians = bone.rotation * Math.PI / 180
      const centerX = attachmentX + (size.width * scaleX) / 2
      const centerY = attachmentY
      const boneX = bone.x * canvasSize.width / 100
      const boneY = bone.y * canvasSize.height / 180
      const worldX = boneX + centerX * Math.cos(boneRadians) - centerY * Math.sin(boneRadians)
      const worldY = boneY + centerX * Math.sin(boneRadians) + centerY * Math.cos(boneRadians)
      const localX = worldX * node.worldScaleX
      const localY = worldY * node.worldScaleY
      const width = size.width * scaleX * node.worldScaleX
      const height = size.height * scaleY * node.worldScaleY
      globalCommandBuffer.pushRegion(
        texture.id,
        region.x,
        region.y,
        region.width,
        region.height,
        node.worldX + localX * cosine - localY * sine - width / 2,
        node.worldY + localX * sine + localY * cosine - height / 2,
        width,
        height,
        node.worldRotation + rotation,
        width / 2,
        height / 2,
        node.flipX,
        node.flipY,
        node.color.r,
        node.color.g,
        node.color.b,
        opacity,
      )
    }
  }

  onDestroy(): void {
    this.texture?.release()
    this.texture = null
  }

  async reload(): Promise<void> {
    const version = ++this.loadVersion
    const [skeleton, atlas] = await Promise.all([
      typeof this.props.data === 'string'
        ? loadJsonAsset<KineSkeletonData>(this.props.data, 'Kine skeleton')
        : Promise.resolve(this.props.data),
      typeof this.props.atlas === 'string'
        ? loadJsonAsset<KineAtlasData>(this.props.atlas, 'Kine atlas')
        : Promise.resolve(this.props.atlas),
    ])
    if (version !== this.loadVersion) return

    this.skeleton = skeleton
    this.atlas = atlas
    this.texture?.release()
    this.texture = AssetManager.acquireTexture(this.props.texture ?? resolveSiblingPath(
      typeof this.props.atlas === 'string' ? this.props.atlas : '',
      atlas.image,
    ))
    this.elapsed = 0
  }

  private get animation(): KineAnimation | undefined {
    const animations = this.skeleton?.animations
    if (!animations) return undefined
    return animations[this.props.animation ?? Object.keys(animations)[0]]
  }

  private sampleSlots(): KineSlot[] {
    const slots = [...(this.skeleton?.slots ?? [])]
    const animation = this.animation
    const frame = animation ? this.elapsed * (animation.fps ?? 0) : 0
    const order = sampleKeyframe(animation?.slotOrderKeyframes, frame)
    if (!order) return slots

    const byId = new Map(slots.map(slot => [slot.id ?? slot.name ?? slot.bone, slot]))
    const ordered = order.flatMap(id => {
      const slot = byId.get(id)
      if (!slot) return []
      byId.delete(id)
      return [slot]
    })
    return [...ordered, ...byId.values()]
  }

  private resolveAttachment(slot: KineSlot): KineAttachment | undefined {
    const skeleton = this.skeleton!
    const skin = skeleton.activeSkinId && skeleton.activeSkinId !== 'default'
      ? skeleton.skins?.find(item => item.id === skeleton.activeSkinId)
      : undefined
    const skinValue = skin?.attachments[slot.id ?? slot.name ?? slot.bone]
    if (skinValue === null) return undefined
    const state: KineSlotState = skinValue === undefined
      ? slot
      : isAttachment(skinValue)
        ? { attachments: [skinValue], displayIndex: 0 }
        : skinValue
    const attachments = state.attachments ?? (state.attachment ? [state.attachment] : [])
    const animation = this.animation
    const frame = animation ? this.elapsed * (animation.fps ?? 0) : 0
    const displayed = sampleKeyframe(animation?.slotDisplayIndexKeyframes, frame)?.[slot.id ?? slot.name ?? slot.bone]
    const legacyIndex = state.activeAttachmentPath === null
      ? -1
      : typeof state.activeAttachmentPath === 'string'
        ? attachments.findIndex(attachment => attachment.path === state.activeAttachmentPath)
        : 0
    const index = displayed ?? state.displayIndex ?? legacyIndex
    return index >= 0 ? attachments[index] : undefined
  }

  private samplePose(): Map<string, Pose> {
    const animation = this.animation
    const frame = animation ? this.elapsed * (animation.fps ?? 0) : 0
    const pose = new Map<string, Pose>()
    for (const bone of this.skeleton!.bones) {
      const sampled = sampleBone(bone, animation?.keyframes[bone.name], frame)
      pose.set(bone.name, sampled)
    }
    return pose
  }
}

function sampleBone(
  bone: KineBone,
  keyframes: Record<string, KineKeyframe> | undefined,
  frame: number,
): Pose {
  const pose: Pose = { ...bone, x: bone.x ?? 0, y: bone.y ?? 0, rotation: bone.rotation ?? 0 }
  if (!keyframes) return pose

  const frames = Object.entries(keyframes)
    .map(([key, value]) => ({ frame: Number(key), value }))
    .filter(entry => Number.isFinite(entry.frame))
    .sort((a, b) => a.frame - b.frame)
  const previous = [...frames].reverse().find(entry => entry.frame <= frame)
  const next = frames.find(entry => entry.frame >= frame)
  if (!previous) return pose

  const progress = next && next.frame !== previous.frame
    ? (frame - previous.frame) / (next.frame - previous.frame)
    : 0
  for (const key of ['x', 'y', 'rotation', 'scale', 'scaleX', 'scaleY'] as const) {
    const from = previous.value[key] ?? pose[key]
    const to = next?.value[key] ?? from
    if (from !== undefined) pose[key] = from + (to - from) * progress
  }
  return pose
}

function sampleKeyframe<T>(keyframes: Record<string, T> | undefined, frame: number): T | undefined {
  if (!keyframes) return undefined
  return Object.entries(keyframes)
    .map(([key, value]) => ({ frame: Number(key), value }))
    .filter(entry => Number.isFinite(entry.frame) && entry.frame <= frame)
    .sort((a, b) => b.frame - a.frame)[0]?.value
}

function isAttachment(value: KineSlotState | KineAttachment): value is KineAttachment {
  return 'path' in value
}

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling
}
