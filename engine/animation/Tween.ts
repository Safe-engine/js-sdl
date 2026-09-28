import { Node } from '../core/Node'
import { clamp01 } from '../helper/math'
import { Easing, EasingFunction } from './Easing'

export type TweenValues<T> = {
  [K in keyof T]?: T[K] extends number
    ? number
    : T[K] extends object
      ? TweenValues<T[K]>
      : never;
}

export interface TweenOptions {
  /**
   * Node whose lifetime bounds the tween: it stops when the node is destroyed
   * and waits while the node's actions are paused. Defaults to the target when
   * it is a Node, or the target's `node` when it is a component.
   */
  owner?: Node
  ease?: EasingFunction
  delay?: number
  onStart?: () => void
  onUpdate?: (progress: number) => void
  onComplete?: () => void
  onStop?: () => void
}

interface TweenTrack {
  target: Record<string, any>
  key: string
  from: number
  to: number
}

interface Animation {
  readonly owner: Node | null
  update(dt: number): boolean
  stop(): void
}

function inferOwner(target: Record<string, any>): Node | null {
  if (target instanceof Node) return target
  return target.node instanceof Node ? target.node : null
}

function isInside(node: Node, ancestor: Node): boolean {
  for (let current: Node | null = node; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

function collectTracks(
  target: Record<string, any>,
  values: Record<string, any>,
  tracks: TweenTrack[],
): void {
  for (const key of Object.keys(values)) {
    const to = values[key]
    const from = target[key]
    if (typeof to === 'number' && typeof from === 'number') {
      tracks.push({ target, key, from, to })
    } else if (to && from && typeof to === 'object' && typeof from === 'object') {
      collectTracks(from, to, tracks)
    } else {
      throw new TypeError(`Tween property "${key}" must target a number`)
    }
  }
}

export class TweenHandle implements Animation {
  private tracks: TweenTrack[] | null = null
  private elapsed = 0
  private started = false
  private finished = false
  readonly owner: Node | null

  constructor(
    private readonly target: Record<string, any>,
    private readonly values: Record<string, any>,
    private readonly duration: number,
    private readonly options: TweenOptions = {},
  ) {
    this.owner = options.owner ?? inferOwner(target)
  }

  update(dt: number): boolean {
    if (this.finished) return true
    this.elapsed += Math.max(0, dt)
    const delay = Math.max(0, this.options.delay ?? 0)
    if (this.elapsed < delay) return false

    if (!this.started) {
      this.started = true
      this.tracks = []
      collectTracks(this.target, this.values, this.tracks)
      this.options.onStart?.()
    }

    const duration = Math.max(0, this.duration)
    const progress = duration === 0
      ? 1
      : clamp01((this.elapsed - delay) / duration)
    const eased = (this.options.ease ?? Easing.linear)(progress)
    for (const track of this.tracks!) {
      track.target[track.key] = track.from + (track.to - track.from) * eased
    }
    this.options.onUpdate?.(progress)

    if (progress < 1) return false
    this.finished = true
    this.options.onComplete?.()
    return true
  }

  stop(): void {
    if (this.finished) return
    this.finished = true
    this.options.onStop?.()
  }
}

type SequenceStep
  = | { type: 'tween', tween: TweenHandle }
    | { type: 'delay', remaining: number }
    | { type: 'call', callback: () => void }

export class TweenSequence implements Animation {
  private readonly steps: SequenceStep[] = []
  private index = 0
  private running = false
  private finished = false

  /** Owner of the first tween step, if any. */
  get owner(): Node | null {
    for (const step of this.steps) {
      if (step.type === 'tween' && step.tween.owner) return step.tween.owner
    }
    return null
  }

  to<T extends object>(
    target: T,
    values: TweenValues<T>,
    duration: number,
    options: TweenOptions = {},
  ): this {
    this.steps.push({
      type: 'tween',
      tween: new TweenHandle(
        target as Record<string, any>,
        values as Record<string, any>,
        duration,
        options,
      ),
    })
    return this
  }

  delay(seconds: number): this {
    this.steps.push({ type: 'delay', remaining: Math.max(0, seconds) })
    return this
  }

  call(callback: () => void): this {
    this.steps.push({ type: 'call', callback })
    return this
  }

  start(): this {
    if (!this.running && !this.finished) {
      this.running = true
      Tween._add(this)
    }
    return this
  }

  update(dt: number): boolean {
    if (this.finished) return true
    let remaining = Math.max(0, dt)

    while (this.index < this.steps.length) {
      const step = this.steps[this.index]
      if (step.type === 'call') {
        step.callback()
        this.index++
        continue
      }
      if (step.type === 'delay') {
        const consumed = Math.min(step.remaining, remaining)
        step.remaining -= consumed
        remaining -= consumed
        if (step.remaining > 0) return false
        this.index++
        continue
      }
      if (!step.tween.update(remaining)) return false
      remaining = 0
      this.index++
    }

    this.finished = true
    return true
  }

  stop(): void {
    if (this.finished) return
    const step = this.steps[this.index]
    if (step?.type === 'tween') step.tween.stop()
    this.finished = true
  }
}

export class Tween {
  private static animations: Animation[] = []
  private static updating: Animation[] | null = null

  static to<T extends object>(
    target: T,
    values: TweenValues<T>,
    duration: number,
    options: TweenOptions = {},
  ): TweenHandle {
    const tween = new TweenHandle(
      target as Record<string, any>,
      values as Record<string, any>,
      duration,
      options,
    )
    this._add(tween)
    return tween
  }

  static sequence(): TweenSequence {
    return new TweenSequence()
  }

  static delay(seconds: number, callback: () => void): TweenSequence {
    return this.sequence().delay(seconds).call(callback).start()
  }

  static update(dt: number): void {
    const current = this.animations
    this.animations = []
    this.updating = current
    for (const animation of current) {
      const owner = animation.owner
      if (owner && !owner.isValid) {
        animation.stop()
        continue
      }
      if (owner?.actionsAndSchedulePaused) {
        this.animations.push(animation)
        continue
      }
      if (!animation.update(dt)) this.animations.push(animation)
    }
    this.updating = null
  }

  /** Stop all animations, except those owned by `except` or its descendants. */
  static stopAll(except?: Node): void {
    const keep = (animation: Animation) =>
      !!except && !!animation.owner && isInside(animation.owner, except)
    for (const animation of this.updating ?? []) {
      if (!keep(animation)) animation.stop()
    }
    const kept: Animation[] = []
    for (const animation of this.animations) {
      if (keep(animation)) kept.push(animation)
      else animation.stop()
    }
    this.animations = kept
  }

  static _add(animation: Animation): void {
    this.animations.push(animation)
  }
}
