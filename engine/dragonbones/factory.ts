import {
  Armature,
  BaseFactory,
  BaseObject,
  DragonBones as DragonBonesRuntime,
  Slot,
  type BuildArmaturePackage,
  type SlotData,
} from 'dragonbones-es'
import type { TextureAsset } from '../AssetManager'
import { SdlArmatureDisplay, SdlDisplay, SdlSlot, SdlTextureAtlasData } from './display'

export class SdlFactory extends BaseFactory {
  constructor(eventManager: SdlArmatureDisplay) {
    super()
    ;(this as any)._dragonBones = new DragonBonesRuntime(eventManager)
  }

  protected _buildTextureAtlasData(
    textureAtlasData: SdlTextureAtlasData | null,
    textureAtlas: TextureAsset | null,
  ): SdlTextureAtlasData {
    const atlasData = textureAtlasData ?? BaseObject.borrowObject(SdlTextureAtlasData)
    if (textureAtlas && atlasData.texture !== textureAtlas) {
      atlasData.texture?.release()
      atlasData.texture = textureAtlas
    }
    return atlasData
  }

  protected _buildArmature(dataPackage: BuildArmaturePackage): Armature {
    const armature = BaseObject.borrowObject(Armature)
    const display = new SdlArmatureDisplay()
    armature.init(dataPackage.armature, display, display, (this as any)._dragonBones)
    return armature
  }

  protected _buildSlot(_dataPackage: BuildArmaturePackage, slotData: SlotData, armature: Armature): Slot {
    const slot = BaseObject.borrowObject(SdlSlot)
    slot.init(slotData, armature, new SdlDisplay(), new SdlDisplay())
    return slot
  }

  parseData(skeleton: any, atlas: any, texture: TextureAsset, key: string): void {
    const dragonBonesData = this.parseDragonBonesData(skeleton, key, 1)
    if (!dragonBonesData) {
      throw new Error(`Failed to parse DragonBones skeleton: ${key}`)
    }

    this.parseTextureAtlasData(atlas, texture, key)
  }

  advanceTime(passedTime: number): void {
    ;(this as any)._dragonBones.advanceTime(passedTime)
  }
}
