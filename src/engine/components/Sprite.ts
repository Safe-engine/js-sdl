import { Component } from "../core/Component";
import { Transform } from "../core/Transform";
import {
  drawTextureRegionRotated,
  drawTextureRotated,
} from "sdl3";
import {
  AssetManager,
  TextureAsset,
  TextureAtlas,
  TextureRegion,
} from "../AssetManager";
import type { Color } from "../animation/Tween";

export class Sprite extends Component {
  texturePath = "";
  textureId = -1;
  width = 64;
  height = 64;
  flipX = false;
  flipY = false;
  visible = true;
  opacity = 1;
  color: Color = { r: 255, g: 255, b: 255, a: 255 };
  atlas: TextureAtlas | null = null;
  frameName = "";
  private texture: TextureAsset | null = null;
  private loadedPath = "";
  private loadedAtlas: TextureAtlas | null = null;

  onStart(): void {
    this.ensureTexture();
  }

  setTexture(path: string): this {
    if (this.texturePath === path && !this.atlas) return this;
    this.releaseTexture();
    this.atlas = null;
    this.texturePath = path;
    return this;
  }

  setFrame(atlas: TextureAtlas, frameName: string): this {
    this.releaseTexture();
    this.atlas = atlas;
    this.frameName = frameName;
    this.ensureTexture();
    return this;
  }

  onRender(): void {
    this.ensureTexture();
    if (!this.visible || this.textureId < 0) return;
    const t = this.node?.getComponent(Transform);
    if (!t) return;

    const frame = this.getFrame();
    const baseWidth = this.width || frame?.width || this.texture?.width || 0;
    const baseHeight = this.height || frame?.height || this.texture?.height || 0;
    const w = baseWidth * t.worldScaleX;
    const h = baseHeight * t.worldScaleY;
    const dx = t.worldX - t.anchorX * w;
    const dy = t.worldY - t.anchorY * h;

    if (frame) {
      drawTextureRegionRotated(
        this.textureId,
        frame.x, frame.y, frame.width, frame.height,
        dx, dy, w, h,
        t.worldRotation,
        t.anchorX * w,
        t.anchorY * h,
        this.flipX, this.flipY,
        this.color.r, this.color.g, this.color.b,
        this.opacity * (this.color.a ?? 255),
      );
      return;
    }

    drawTextureRotated(
      this.textureId,
      dx, dy,
      w, h,
      t.worldRotation,
      t.anchorX * w,
      t.anchorY * h,
      this.flipX,
      this.flipY,
      this.color.r,
      this.color.g,
      this.color.b,
      this.opacity * (this.color.a ?? 255),
    );
  }

  onDestroy(): void {
    this.releaseTexture();
  }

  private ensureTexture(): void {
    if (this.atlas) {
      if (this.texture && this.loadedAtlas === this.atlas) return;
      this.releaseTexture();
      this.texture = AssetManager.acquireTexture(this.atlas.texture.key);
      this.loadedAtlas = this.atlas;
      this.textureId = this.texture.id;
      return;
    }
    if (!this.texturePath) {
      this.releaseTexture();
      return;
    }
    if (this.texture && this.loadedPath === this.texturePath) return;
    this.releaseTexture();
    this.texture = AssetManager.acquireTexture(this.texturePath);
    this.loadedPath = this.texturePath;
    this.textureId = this.texture.id;
  }

  private getFrame(): TextureRegion | null {
    return this.atlas?.getFrame(this.frameName) ?? null;
  }

  private releaseTexture(): void {
    this.texture?.release();
    this.texture = null;
    this.loadedPath = "";
    this.loadedAtlas = null;
    this.textureId = -1;
  }
}
