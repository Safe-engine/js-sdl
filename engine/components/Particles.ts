import { ComponentX } from '../core/ComponentX'
import type { InputEvent } from '../Input'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'

export interface ParticlesProps {
  count?: number
  duration?: number
  speed?: number
  gravity?: number
  radius?: number
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
  color: Color
}

const DEFAULT_COLORS: readonly Color[] = [
  { r: 255, g: 222, b: 89 },
  { r: 255, g: 143, b: 86 },
  { r: 116, g: 219, b: 255 },
]

export class Particles extends ComponentX<ParticlesProps> {
  private particles: Particle[] = []

  onAwake(): void {
    this.inputEnabled = this.props.emitOnTouch ?? false
    this.inputPriority = this.inputEnabled ? Number.MAX_SAFE_INTEGER : 0
  }

  get activeCount(): number {
    return this.particles.length
  }

  emit(x: number, y: number, count = this.props.count ?? 16): void {
    const duration = this.props.duration ?? 0.55
    const speed = this.props.speed ?? 150
    const radius = this.props.radius ?? 7
    const colors = this.props.colors?.length ? this.props.colors : DEFAULT_COLORS

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const particleDuration = duration * (0.7 + Math.random() * 0.3)
      this.particles.push({
        x,
        y,
        velocityX: Math.cos(angle) * speed * (0.5 + Math.random() * 0.5),
        velocityY: Math.sin(angle) * speed - speed * 0.35,
        life: particleDuration,
        duration: particleDuration,
        radius: radius * (0.65 + Math.random() * 0.35),
        color: colors[i % colors.length],
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
    const gravity = this.props.gravity ?? 260
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]
      particle.life -= dt
      if (particle.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      particle.velocityY += gravity * dt
      particle.x += particle.velocityX * dt
      particle.y += particle.velocityY * dt
    }
  }

  onRender(): void {
    const scale = (Math.abs(this.node.worldScaleX) + Math.abs(this.node.worldScaleY)) * 0.5
    for (const particle of this.particles) {
      const position = this.node.localToWorld(particle.x, particle.y)
      const alpha = Math.round(255 * this.node.opacity * particle.life / particle.duration)
      globalCommandBuffer.pushCircle(position.x, position.y, particle.radius * scale,
        particle.color.r, particle.color.g, particle.color.b, alpha, true)
    }
  }
}
