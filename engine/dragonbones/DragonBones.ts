import { Armature, EventObject } from 'dragonbones-es'
import { ComponentX } from '../core/ComponentX'
import { SdlArmatureDisplay, SdlSlot } from './display'
import { SdlFactory } from './factory'
import { loadDragonBonesData } from './loader'
import type { DragonBonesProps } from './types'

export class DragonBones extends ComponentX<DragonBonesProps> {
  private factory: SdlFactory | null = null
  private armature: Armature | null = null
  private loadedKey = ''
  private loadVersion = 0
  private completedLoops = 0
  private animationEnded = false

  onStart(): void {
    void this.reload().catch((error) => {
      console.error('DragonBones reload failed', error)
    })
  }

  onUpdate(dt: number): void {
    if (this.armature) {
      this.armature.animation.timeScale = this.props.timeScale ?? 1
    }
    this.factory?.advanceTime(dt)
    this.syncAnimationCallbacks()
  }

  onRender(): void {
    if (!this.node.visible || !this.armature) return
    for (const slot of this.armature.getSlots()) {
      if (slot instanceof SdlSlot) slot.render(this)
    }
  }

  onDestroy(): void {
    this.disposeArmature()
  }

  async reload(): Promise<void> {
    const data = this.props.data
    if (!data) return

    const version = ++this.loadVersion
    const loaded = await loadDragonBonesData(data)
    if (version !== this.loadVersion) {
      loaded.texture.release()
      return
    }

    this.disposeArmature()
    this.loadedKey = loaded.key
    this.factory = new SdlFactory(new SdlArmatureDisplay())
    this.factory.parseData(loaded.skeleton, loaded.atlas, loaded.texture, loaded.key)
    this.armature = this.factory.buildArmature(
      this.factory.getDragonBonesData(loaded.key)?.armatureNames[0] ?? '',
      loaded.key,
      this.props.skin ?? '',
      loaded.key,
    )

    if (!this.armature) {
      loaded.texture.release()
      throw new Error(`Failed to build DragonBones armature for ${loaded.key}.`)
    }

    this.armature.clock = this.factory.clock
    this.bindAnimationEvents()
    this.play(this.props.animation, this.props.playTimes)
  }

  play(animation = this.props.animation, playTimes = this.props.playTimes): void {
    if (!this.armature) return
    this.completedLoops = 0
    this.animationEnded = false
    this.armature.animation.timeScale = this.props.timeScale ?? 1
    this.armature.animation.play(animation ?? null, playTimes ?? 0)
  }

  private bindAnimationEvents(): void {
    const display = this.armature?.display as SdlArmatureDisplay | undefined
    if (!display) return

    display.addDBEventListener(EventObject.START, (event: EventObject) => {
      this.props.onAnimationStart?.call(this, event.animationState?.name)
    }, this)
    display.addDBEventListener(EventObject.LOOP_COMPLETE, (event: EventObject) => {
      this.emitAnimationComplete(
        event.animationState?.name,
        event.animationState?.currentPlayTimes,
      )
    }, this)
    display.addDBEventListener(EventObject.COMPLETE, (event: EventObject) => {
      if (this.animationEnded) return
      this.animationEnded = true
      this.props.onAnimationEnd?.call(this, event.animationState?.name)
    }, this)
  }

  private syncAnimationCallbacks(): void {
    if (!this.armature) return
    for (const state of this.armature.animation.getStates()) {
      if (state.currentPlayTimes > this.completedLoops) {
        this.emitAnimationComplete(state.name, state.currentPlayTimes)
      }
      if (state.isCompleted && !this.animationEnded) {
        this.animationEnded = true
        this.props.onAnimationEnd?.call(this, state.name)
      }
    }
  }

  private emitAnimationComplete(animationName?: string, loopCount = 0): void {
    if (loopCount <= this.completedLoops) return
    this.completedLoops = loopCount
    this.props.onAnimationComplete?.call(this, animationName, loopCount)
  }

  private disposeArmature(): void {
    this.loadVersion++
    this.armature?.dispose()
    this.armature = null
    if (this.factory && this.loadedKey) {
      this.factory.removeDragonBonesData(this.loadedKey, true)
      this.factory.removeTextureAtlasData(this.loadedKey, true)
    }
    this.factory = null
    this.loadedKey = ''
  }
}
