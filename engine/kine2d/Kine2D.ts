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
  size: { width: number, height: number }
  x?: number
  y?: number
  rotation?: number
  scale?: number
  scaleX?: number
  scaleY?: number
}

interface KineSlot {
  bone: string
  attachments: KineAttachment[]
  displayIndex: number
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
  length: number
  fps: number
  keyframes: Record<string, Record<string, KineKeyframe>>
}

export interface KineSkeletonData {
  bones: KineBone[]
  slots: KineSlot[]
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
    if (!animation || animation.length <= 0 || animation.fps <= 0) return

    this.elapsed += dt
    const duration = animation.length / animation.fps
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
    const node = this.node
    const opacity = node.opacity * (node.color.a ?? 255)
    const radians = node.worldRotation * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)

    for (const slot of skeleton.slots) {
      const attachment = slot.attachments[slot.displayIndex]
      const bone = pose.get(slot.bone)
      const region = attachment && regions.get(attachment.path)
      if (!attachment || !bone || !region) continue

      const scaleX = (bone.scaleX ?? bone.scale ?? 1) * (attachment.scaleX ?? attachment.scale ?? 1)
      const scaleY = (bone.scaleY ?? bone.scale ?? 1) * (attachment.scaleY ?? attachment.scale ?? 1)
      const localX = (bone.x + (attachment.x ?? 0)) * node.worldScaleX
      const localY = (bone.y + (attachment.y ?? 0)) * node.worldScaleY
      globalCommandBuffer.pushRegion(
        texture.id,
        region.x,
        region.y,
        region.width,
        region.height,
        node.worldX + localX * cosine - localY * sine,
        node.worldY + localX * sine + localY * cosine,
        attachment.size.width * scaleX * node.worldScaleX,
        attachment.size.height * scaleY * node.worldScaleY,
        node.worldRotation + bone.rotation + (attachment.rotation ?? 0),
        0,
        0,
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

  private samplePose(): Map<string, Pose> {
    const animation = this.animation
    const frame = animation ? this.elapsed * animation.fps : 0
    const pose = new Map<string, Pose>()
    for (const bone of this.skeleton!.bones) {
      const sampled = sampleBone(bone, animation?.keyframes[bone.name], frame)
      const parent = bone.parent ? pose.get(bone.parent) : undefined
      pose.set(bone.name, {
        ...sampled,
        x: sampled.x + (parent?.x ?? 0),
        y: sampled.y + (parent?.y ?? 0),
        rotation: sampled.rotation + (parent?.rotation ?? 0),
      })
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

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling
}
