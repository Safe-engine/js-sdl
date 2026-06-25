export type EasingFunction = (progress: number) => number

export type TweenValues<T> = {
  [K in keyof T]?: T[K] extends number
    ? number
    : T[K] extends object
      ? TweenValues<T[K]>
      : never;
}

export interface TweenOptions {
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
  update(dt: number): boolean
  stop(): void
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export const Easing = {
  linear: (t: number): number => t,
  quadIn: (t: number): number => t * t,
  quadOut: (t: number): number => t * (2 - t),
  quadInOut: (t: number): number =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  cubicIn: (t: number): number => t * t * t,
  cubicOut: (t: number): number => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  sineIn: (t: number): number => 1 - Math.cos(t * Math.PI / 2),
  sineOut: (t: number): number => Math.sin(t * Math.PI / 2),
  sineInOut: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,
  backOut: (t: number): number => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  bounceOut: (t: number): number => {
    const n1 = 7.5625
    const d1 = 2.75
    if (t < 1 / d1) return n1 * t * t
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
    return n1 * (t -= 2.625 / d1) * t + 0.984375
  },
} satisfies Record<string, EasingFunction>

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

  constructor(
    private readonly target: Record<string, any>,
    private readonly values: Record<string, any>,
    private readonly duration: number,
    private readonly options: TweenOptions = {},
  ) {}

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
      if (!animation.update(dt)) this.animations.push(animation)
    }
    this.updating = null
  }

  static stopAll(): void {
    for (const animation of this.updating ?? []) animation.stop()
    for (const animation of this.animations) animation.stop()
    this.animations.length = 0
  }

  static _add(animation: Animation): void {
    this.animations.push(animation)
  }
}
