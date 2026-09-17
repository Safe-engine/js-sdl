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
  mesh?: KineMesh
}

interface KineMesh {
  vertices: number[]
  uvs: number[]
  triangles: number[]
  bones?: string[]
  bindBones?: KineBone[]
  weights?: Array<Record<string, number>>
  width?: number
  height?: number
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
      if (attachment.mesh) {
        this.renderMesh(attachment, region, slot.bone, pose, canvasSize)
        continue
      }
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

  private renderMesh(
    attachment: KineAttachment,
    region: KineAtlasData['regions'][number],
    slotBone: string,
    pose: Map<string, Pose>,
    canvasSize: { width: number, height: number },
  ): void {
    const mesh = attachment.mesh!
    const texture = this.texture!
    if (mesh.vertices.length !== mesh.uvs.length || mesh.vertices.length % 2 !== 0) return

    const bindBones = mesh.bindBones?.length ? mesh.bindBones : this.skeleton!.bones
    const bindPose = new Map(bindBones.map(bone => [bone.name, bone]))
    const restSlotBone = bindPose.get(slotBone)
    const currentSlotBone = pose.get(slotBone)
    if (!restSlotBone || !currentSlotBone) return
    const restPositions = transformMeshBySlotBone(attachment, restSlotBone, canvasSize)
    const currentPositions = transformMeshBySlotBone(attachment, currentSlotBone, canvasSize)
    const positions = new Float32Array(mesh.vertices.length)

    for (let i = 0; i < positions.length; i += 2) {
      const weights = mesh.weights?.[i / 2]
      if (!weights) {
        positions[i] = currentPositions[i]
        positions[i + 1] = currentPositions[i + 1]
        continue
      }

      let x = 0
      let y = 0
      let totalWeight = 0
      for (const [boneName, weight] of Object.entries(weights)) {
        if (weight <= 0) continue
        const setup = bindPose.get(boneName)
        const current = pose.get(boneName)
        if (!setup || !current) continue
        const point = transformFromSetupPose(
          restPositions[i],
          restPositions[i + 1],
          setup,
          current,
          canvasSize,
        )
        x += point.x * weight
        y += point.y * weight
        totalWeight += weight
      }
      positions[i] = totalWeight > 0 ? x / totalWeight : currentPositions[i]
      positions[i + 1] = totalWeight > 0 ? y / totalWeight : currentPositions[i + 1]
    }

    const uvs = new Float32Array(mesh.uvs.length)
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i] = (region.x + mesh.uvs[i] * region.width) / texture.width
      uvs[i + 1] = (region.y + mesh.uvs[i + 1] * region.height) / texture.height
    }

    const node = this.node
    const radians = node.worldRotation * Math.PI / 180
    globalCommandBuffer.pushMesh(
      texture.id,
      positions,
      uvs,
      Uint16Array.from(mesh.triangles),
      node.color.r,
      node.color.g,
      node.color.b,
      node.opacity * (node.color.a ?? 255),
      node.worldX,
      node.worldY,
      node.worldScaleX,
      node.worldScaleY,
      Math.cos(radians),
      Math.sin(radians),
    )
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
    if (from === undefined) continue
    pose[key] = key === 'rotation'
      ? from + shortestAngleDelta(from, to) * progress
      : from + (to - from) * progress
  }
  return pose
}

function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
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

function transformMeshBySlotBone(
  attachment: KineAttachment,
  bone: KineBone,
  canvasSize: { width: number, height: number },
): Float32Array {
  const mesh = attachment.mesh!
  const scaleX = (bone.scaleX ?? bone.scale ?? 1) * (attachment.scaleX ?? attachment.scale ?? 1)
  const scaleY = (bone.scaleY ?? bone.scale ?? 1) * (attachment.scaleY ?? attachment.scale ?? 1)
  const local = new Float32Array(mesh.vertices.length)
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let i = 0; i < local.length; i += 2) {
    const x = (attachment.x ?? 0) + mesh.vertices[i] * scaleX
    const y = (attachment.y ?? 0) + mesh.vertices[i + 1] * scaleY
    local[i] = x
    local[i + 1] = y
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const centerX = mesh.width !== undefined && mesh.height !== undefined
    ? (attachment.x ?? 0) + mesh.width * scaleX / 2
    : (minX + maxX) / 2
  const centerY = mesh.width !== undefined && mesh.height !== undefined
    ? attachment.y ?? 0
    : (minY + maxY) / 2
  const attachmentRadians = (attachment.rotation ?? 0) * Math.PI / 180
  const attachmentCosine = Math.cos(attachmentRadians)
  const attachmentSine = Math.sin(attachmentRadians)
  const radians = (bone.rotation ?? 0) * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const originX = (bone.x ?? 0) * canvasSize.width / 100
  const originY = (bone.y ?? 0) * canvasSize.height / 180
  const result = new Float32Array(local.length)
  for (let i = 0; i < local.length; i += 2) {
    const offsetX = local[i] - centerX
    const offsetY = local[i + 1] - centerY
    const attachmentX = centerX + offsetX * attachmentCosine - offsetY * attachmentSine
    const attachmentY = centerY + offsetX * attachmentSine + offsetY * attachmentCosine
    result[i] = originX + attachmentX * cosine - attachmentY * sine
    result[i + 1] = originY + attachmentX * sine + attachmentY * cosine
  }
  return result
}

function transformFromSetupPose(
  x: number,
  y: number,
  setup: KineBone,
  current: Pose,
  canvasSize: { width: number, height: number },
): { x: number, y: number } {
  const setupX = (setup.x ?? 0) * canvasSize.width / 100
  const setupY = (setup.y ?? 0) * canvasSize.height / 180
  const currentX = current.x * canvasSize.width / 100
  const currentY = current.y * canvasSize.height / 180
  const setupRadians = -(setup.rotation ?? 0) * Math.PI / 180
  const setupCosine = Math.cos(setupRadians)
  const setupSine = Math.sin(setupRadians)
  const setupScaleX = setup.scaleX ?? setup.scale ?? 1
  const setupScaleY = setup.scaleY ?? setup.scale ?? 1
  const localX = ((x - setupX) * setupCosine - (y - setupY) * setupSine) / setupScaleX
  const localY = ((x - setupX) * setupSine + (y - setupY) * setupCosine) / setupScaleY
  const currentRadians = current.rotation * Math.PI / 180
  const currentCosine = Math.cos(currentRadians)
  const currentSine = Math.sin(currentRadians)
  const currentScaleX = current.scaleX ?? current.scale ?? 1
  const currentScaleY = current.scaleY ?? current.scale ?? 1
  const scaledX = localX * currentScaleX
  const scaledY = localY * currentScaleY
  return {
    x: currentX + scaledX * currentCosine - scaledY * currentSine,
    y: currentY + scaledX * currentSine + scaledY * currentCosine,
  }
}

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling
}
