import { drawTextureQuad } from 'sdl3'
import { ComponentX } from '../core/ComponentX'
import { loadSkelForm, type LoadedSkelForm } from './loader'
import {
  SkfGenericAnimate,
  SkfGenericConstruct,
  SkfGenericFormatFrame,
  SkfGenericGetBoneTexture,
} from './skelform-js'
import type {
  SkelFormAnimation,
  SkelFormArmature,
  SkelFormBone,
  SkelFormData,
  SkelFormProps,
  SkelFormStyle,
  SkelFormVec2,
  SkelFormVisual,
} from './types'

export class SkelForm extends ComponentX<SkelFormProps> {
  armature: SkelFormArmature | null = null

  private loaded: LoadedSkelForm | null = null
  private animation: SkelFormAnimation | null = null
  private activeStyles: SkelFormStyle[] = []
  private animationTime = 0
  private completedLoops = 0
  private loadVersion = 0

  onStart(): void {
    void this.reload().catch((error) => {
      console.error('SkelForm reload failed', error)
    })
  }

  onUpdate(dt: number): void {
    if (!this.armature || !this.animation) return
    this.animationTime += dt * (this.props.timeScale ?? 1)
    const loop = this.props.loop ?? true
    const frame = SkfGenericFormatFrame(
      this.animationTime * this.animation.fps,
      this.animation,
      false,
      loop,
    )
    SkfGenericAnimate(
      this.armature.bones,
      [this.animation],
      [frame],
      [this.props.smoothFrames ?? 0],
    )
    SkfGenericConstruct(this.armature)
    this.emitAnimationComplete(loop)
  }

  onRender(): void {
    const armature = this.armature
    if (!this.node?.visible || !armature?.cachedBones) return

    const hidden = hiddenBoneIds(armature.cachedBones)
    const bones = [...armature.cachedBones].sort((left, right) =>
      visualZIndex(armature, left) - visualZIndex(armature, right)
    )
    for (const bone of bones) {
      if (hidden.has(bone.id)) continue
      const visual = armature.visuals[bone.visuals_id]
      if (!visual) continue
      const texture = SkfGenericGetBoneTexture(visual.tex, this.activeStyles)
      if (!texture) continue
      const atlas = armature.atlases[texture.atlas_idx]
      if (atlas?.textureId === undefined) continue
      this.renderVisual(bone, visual, texture, atlas.textureId, atlas.size)
    }
  }

  onDestroy(): void {
    this.disposeArmature()
  }

  setData(data: SkelFormData): void {
    this.props.data = data
    void this.reload().catch((error) => {
      console.error('SkelForm reload failed', error)
    })
  }

  play(animation = this.props.animation, loop = this.props.loop): void {
    if (loop !== undefined) this.props.loop = loop
    if (animation !== undefined) this.props.animation = animation
    this.animation = this.resolveAnimation(animation)
    this.animationTime = 0
    this.completedLoops = 0
    this.applyCurrentFrame()
  }

  setStyles(styles: string[]): void {
    this.props.styles = styles
    this.activeStyles = this.resolveStyles(styles)
  }

  async reload(): Promise<void> {
    if (!this.props.data) return
    const version = ++this.loadVersion
    const loaded = await loadSkelForm(this.props.data)
    if (version !== this.loadVersion) {
      loaded.release()
      return
    }

    this.disposeArmature()
    this.loaded = loaded
    this.armature = loaded.armature
    this.activeStyles = this.resolveStyles(this.props.styles)
    this.animation = this.resolveAnimation(this.props.animation)
    this.animationTime = 0
    this.completedLoops = 0
    this.applyCurrentFrame()
  }

  private applyCurrentFrame(): void {
    if (!this.armature) return
    if (this.animation) {
      SkfGenericAnimate(
        this.armature.bones,
        [this.animation],
        [0],
        [0],
      )
    }
    SkfGenericConstruct(this.armature)
  }

  private resolveAnimation(name?: string): SkelFormAnimation | null {
    if (!this.armature) return null
    if (name !== undefined) {
      return this.armature.animations.find(animation => animation.name === name) ?? null
    }
    return this.armature.animations[0] ?? null
  }

  private resolveStyles(names?: readonly string[]): SkelFormStyle[] {
    if (!this.armature) return []
    if (names?.length) {
      const styles = names
        .map(name => this.armature!.styles.find(style => style.name === name))
        .filter((style): style is SkelFormStyle => !!style)
      if (styles.length) return styles
    }
    const defaultStyle = this.armature.styles.find(style => style.name === 'Default')
    return defaultStyle ? [defaultStyle] : [...this.armature.styles]
  }

  private emitAnimationComplete(loop: boolean): void {
    if (!this.animation) return
    const lastFrame = this.animation.keyframes.at(-1)?.frame ?? 0
    const duration = (lastFrame + 1) / this.animation.fps
    if (duration <= 0) return
    const loops = Math.floor(this.animationTime / duration)
    const completed = loop ? loops : Math.min(loops, 1)
    if (completed <= this.completedLoops) return
    this.completedLoops = completed
    this.props.onAnimationComplete?.call(this, this.animation.name, completed)
  }

  private renderVisual(
    bone: SkelFormBone,
    visual: SkelFormVisual,
    texture: ReturnType<typeof SkfGenericGetBoneTexture> & {},
    textureId: number,
    atlasSize: SkelFormVec2,
  ): void {
    const left = texture.offset.x / atlasSize.x
    const right = (texture.offset.x + texture.size.x) / atlasSize.x
    const top = texture.offset.y / atlasSize.y
    const bottom = (texture.offset.y + texture.size.y) / atlasSize.y

    if (visual.vertices?.length && visual.indices?.length) {
      for (let index = 0; index < visual.indices.length; index += 3) {
        const vertex0 = visual.vertices[visual.indices[index]]
        const vertex1 = visual.vertices[visual.indices[index + 1]]
        const vertex2 = visual.vertices[visual.indices[index + 2]]
        if (!vertex0 || !vertex1 || !vertex2) continue
        const point0 = this.transformPoint(vertex0.pos.x, -vertex0.pos.y)
        const point1 = this.transformPoint(vertex1.pos.x, -vertex1.pos.y)
        const point2 = this.transformPoint(vertex2.pos.x, -vertex2.pos.y)
        const uv0 = atlasUv(vertex0.uv, left, right, top, bottom)
        const uv1 = atlasUv(vertex1.uv, left, right, top, bottom)
        const uv2 = atlasUv(vertex2.uv, left, right, top, bottom)
        this.drawTriangle(textureId, point0, uv0, point1, uv1, point2, uv2)
      }
      return
    }

    const width = texture.size.x * bone.scale.x
    const height = texture.size.y * bone.scale.y
    const corners = [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: -width / 2, y: height / 2 },
      { x: width / 2, y: height / 2 },
    ].map((point) => {
      const rotated = rotate(point, -bone.rot)
      return this.transformPoint(rotated.x + bone.pos.x, rotated.y - bone.pos.y)
    })

    drawTextureQuad(
      textureId,
      corners[0].x, corners[0].y, left, top,
      corners[1].x, corners[1].y, right, top,
      corners[2].x, corners[2].y, left, bottom,
      corners[3].x, corners[3].y, right, bottom,
      255, 255, 255, 255 * (this.node.opacity ?? 1),
    )
  }

  private drawTriangle(
    textureId: number,
    point0: SkelFormVec2,
    uv0: SkelFormVec2,
    point1: SkelFormVec2,
    uv1: SkelFormVec2,
    point2: SkelFormVec2,
    uv2: SkelFormVec2,
  ): void {
    drawTextureQuad(
      textureId,
      point0.x, point0.y, uv0.x, uv0.y,
      point1.x, point1.y, uv1.x, uv1.y,
      point2.x, point2.y, uv2.x, uv2.y,
      point2.x, point2.y, uv2.x, uv2.y,
      255, 255, 255, 255 * (this.node.opacity ?? 1),
    )
  }

  private transformPoint(x: number, y: number): SkelFormVec2 {
    if (!this.node) return { x, y }
    const radians = this.node.worldRotation * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const scaledX = x * this.node.worldScaleX
    const scaledY = y * this.node.worldScaleY
    return {
      x: this.node.worldX + scaledX * cosine - scaledY * sine,
      y: this.node.worldY + scaledX * sine + scaledY * cosine,
    }
  }

  private disposeArmature(): void {
    this.loadVersion++
    this.loaded?.release()
    this.loaded = null
    this.armature = null
    this.animation = null
    this.activeStyles = []
  }
}

function atlasUv(
  uv: SkelFormVec2,
  left: number,
  right: number,
  top: number,
  bottom: number,
): SkelFormVec2 {
  return {
    x: left + (right - left) * uv.x,
    y: top + (bottom - top) * uv.y,
  }
}

function rotate(point: SkelFormVec2, radians: number): SkelFormVec2 {
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  }
}

function visualZIndex(armature: SkelFormArmature, bone: SkelFormBone): number {
  return armature.visuals[bone.visuals_id]?.zindex ?? 0
}

function hiddenBoneIds(bones: readonly SkelFormBone[]): Set<number> {
  const hidden = new Set<number>()
  for (const bone of bones) {
    if (bone.hidden || (bone.parent_id >= 0 && hidden.has(bone.parent_id))) {
      hidden.add(bone.id)
    }
  }
  return hidden
}
