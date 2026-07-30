import { AssetManager, TextureAsset } from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { loadTextAsset } from '../helper/text-resource'
import type { InputEvent } from '../Input'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import { SpriteFrameRegion, spriteFrameCache } from '../SpriteFrameCache'

export interface ParticlesEmitOptions {
  angle?: number
  angleSpread?: number
  speed?: number
  duration?: number
  radius?: number
  width?: number
  height?: number
  rotation?: number
  gravity?: number
  targetY?: number
  color?: Color
}

export interface ParticlesProps {
  configFile?: string
  spriteFrame?: string
  additive?: boolean
  count?: number
  duration?: number
  speed?: number
  gravity?: number
  radius?: number
  width?: number
  height?: number
  angle?: number
  angleSpread?: number
  rotation?: number
  rotationFollowVelocity?: boolean
  colors?: readonly Color[]
  emitOnTouch?: boolean
}

interface Particle {
  x: number
  y: number
  velocityX: number
  velocityY: number
  life: number
  duration: number
  radius: number
  width: number
  height: number
  rotation: number
  color: Color
  gravity?: number
  targetY?: number
}

const DEFAULT_COLORS: readonly Color[] = [
  { r: 255, g: 222, b: 89 },
  { r: 255, g: 143, b: 86 },
  { r: 116, g: 219, b: 255 },
]

export class Particles extends ComponentX<ParticlesProps> {
  private readonly inlineProps: ParticlesProps
  private particles: Particle[] = []
  private texture: TextureAsset | null = null
  private textureId = -1
  private loadedSpriteFrame = ''
  private frame: SpriteFrameRegion | null = null
  private loadVersion = 0

  constructor(props?: ParticlesProps) {
    super(props)
    this.inlineProps = { ...this.props }
  }

  onAwake(): void {
    this.applyProps()
    void this.reload()
  }

  get activeCount(): number {
    return this.particles.length
  }

  emit(x: number, y: number, count = this.props.count ?? 16, options?: ParticlesEmitOptions): void {
    const duration = options?.duration ?? this.props.duration ?? 0.55
    const speed = options?.speed ?? this.props.speed ?? 150
    const radius = options?.radius ?? this.props.radius ?? 7
    const width = options?.width ?? this.props.width ?? (radius * 2)
    const height = options?.height ?? this.props.height ?? (radius * 2)
    const colors = options?.color ? [options.color] : (this.props.colors?.length ? this.props.colors : DEFAULT_COLORS)

    const baseAngle = options?.angle ?? this.props.angle
    const angleSpread = options?.angleSpread ?? this.props.angleSpread ?? (baseAngle !== undefined ? 0 : 360)
    const baseRotation = options?.rotation ?? this.props.rotation

    for (let i = 0; i < count; i++) {
      let angleRad = 0
      if (baseAngle !== undefined) {
        const spreadRad = (angleSpread * Math.PI) / 180
        const offset = spreadRad > 0 ? (Math.random() - 0.5) * spreadRad : 0
        angleRad = (baseAngle * Math.PI) / 180 + offset
      } else {
        angleRad = Math.random() * Math.PI * 2
      }

      const particleDuration = duration * (0.7 + Math.random() * 0.3)
      let velocityX = 0
      let velocityY = 0

      if (baseAngle !== undefined) {
        velocityX = Math.cos(angleRad) * speed * (0.85 + Math.random() * 0.3)
        velocityY = Math.sin(angleRad) * speed * (0.85 + Math.random() * 0.3)
      } else {
        velocityX = Math.cos(angleRad) * speed * (0.5 + Math.random() * 0.5)
        velocityY = Math.sin(angleRad) * speed - speed * 0.35
      }

      let particleRotation = baseRotation ?? 0
      if (this.props.rotationFollowVelocity || (baseRotation === undefined && baseAngle !== undefined)) {
        particleRotation = Math.atan2(velocityY, velocityX) * (180 / Math.PI)
      }

      this.particles.push({
        x,
        y,
        velocityX,
        velocityY,
        life: particleDuration,
        duration: particleDuration,
        radius: radius * (0.65 + Math.random() * 0.35),
        width,
        height,
        rotation: particleRotation,
        color: colors[i % colors.length],
        gravity: options?.gravity,
        targetY: options?.targetY,
      })
    }
  }

  hitTest(): boolean {
    return this.inputEnabled
  }

  onPointerStart(event: InputEvent): void {
    const position = this.node.convertToNodeSpace({ x: event.x, y: event.y })
    this.emit(position.x, position.y)
  }

  onUpdate(dt: number): void {
    const defaultGravity = this.props.gravity ?? 260
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]
      particle.life -= dt
      if (particle.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      const gravity = particle.gravity ?? defaultGravity
      particle.velocityY += gravity * dt
      particle.x += particle.velocityX * dt
      particle.y += particle.velocityY * dt

      if (particle.targetY !== undefined && particle.y >= particle.targetY) {
        particle.y = particle.targetY
        particle.velocityX = 0
        particle.velocityY = 0
      }

      if (this.props.rotationFollowVelocity && (particle.velocityX !== 0 || particle.velocityY !== 0)) {
        particle.rotation = Math.atan2(particle.velocityY, particle.velocityX) * (180 / Math.PI)
      }
    }
  }

  onRender(): void {
    const scaleX = Math.abs(this.node.worldScaleX)
    const scaleY = Math.abs(this.node.worldScaleY)
    const scale = (scaleX + scaleY) * 0.5
    this.ensureTexture()
    for (const particle of this.particles) {
      const position = this.node.localToWorld(particle.x, particle.y)
      const alpha = Math.round(255 * this.node.opacity * particle.life / particle.duration)
      const pWidth = (particle.width ?? particle.radius * 2) * scaleX
      const pHeight = (particle.height ?? particle.radius * 2) * scaleY
      const rotation = (particle.rotation ?? 0) + this.node.worldRotation

      if (this.textureId >= 0) {
        const x = position.x - pWidth * 0.5
        const y = position.y - pHeight * 0.5
        if (this.frame) {
          globalCommandBuffer.pushRegion(
            this.textureId,
            this.frame.x, this.frame.y, this.frame.width, this.frame.height,
            x, y, pWidth, pHeight,
            rotation,
            pWidth * 0.5, pHeight * 0.5,
            false, false,
            particle.color.r, particle.color.g, particle.color.b, alpha,
            this.props.additive,
          )
        } else {
          globalCommandBuffer.pushSprite(
            this.textureId,
            x, y, pWidth, pHeight,
            rotation,
            pWidth * 0.5, pHeight * 0.5,
            false, false,
            particle.color.r, particle.color.g, particle.color.b, alpha,
            this.props.additive,
          )
        }
        continue
      }
      globalCommandBuffer.pushCircle(position.x, position.y, particle.radius * scale,
        particle.color.r, particle.color.g, particle.color.b, alpha, true)
    }
  }

  onDestroy(): void {
    this.loadVersion++
    this.releaseTexture()
  }

  async reload(): Promise<void> {
    const configFile = this.inlineProps.configFile
    if (!configFile) return

    const version = ++this.loadVersion
    const config = JSON.parse(await loadTextAsset(configFile, 'particle config')) as Partial<ParticlesProps>
    if (version !== this.loadVersion) return
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Particle config must be a JSON object: ${configFile}`)
    }

    this.props = { ...config, ...this.inlineProps }
    this.applyProps()
  }

  private applyProps(): void {
    this.inputEnabled = this.props.emitOnTouch ?? false
    this.inputPriority = this.inputEnabled ? Number.MAX_SAFE_INTEGER : 0
    this.ensureTexture()
  }

  private ensureTexture(): void {
    const spriteFrame = this.props.spriteFrame
    if (!spriteFrame) {
      this.releaseTexture()
      return
    }
    if (this.texture && this.loadedSpriteFrame === spriteFrame) return

    this.releaseTexture()
    const definition = spriteFrameCache.get(spriteFrame)
    this.texture = AssetManager.acquireTexture(definition?.texturePath ?? spriteFrame, { additive: this.props.additive })
    this.textureId = this.texture.id
    this.loadedSpriteFrame = spriteFrame
    this.frame = definition?.region ?? null
  }

  private releaseTexture(): void {
    this.texture?.release()
    this.texture = null
    this.textureId = -1
    this.loadedSpriteFrame = ''
    this.frame = null
  }
}
