import { Texture, TextureFilter, TextureWrap } from '@esotericsoftware/spine-core'
import type { TextureAsset } from '../AssetManager'

export class SdlSpineTexture extends Texture {
  constructor(readonly asset: TextureAsset) {
    super(asset)
  }

  setFilters(_minFilter: TextureFilter, _magFilter: TextureFilter): void {}
  setWraps(_uWrap: TextureWrap, _vWrap: TextureWrap): void {}

  dispose(): void {
    this.asset.release()
  }
}
