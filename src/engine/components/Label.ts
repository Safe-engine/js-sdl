import { Component } from "../core/Component";
import { Transform } from "../core/Transform";
import { drawTextureRotated } from "sdl3";
import {
  AssetManager,
  FontAsset,
  TextureAsset,
} from "../AssetManager";
import type { Color } from "../animation/Tween";

export class Label extends Component {
  text = "";
  fontPath = "";
  fontSize = 24;
  fontId = -1;
  opacity = 1;
  color: Color = { r: 255, g: 255, b: 255, a: 255 };
  private font: FontAsset | null = null;
  private textTexture: TextureAsset | null = null;
  private loadedFontKey = "";
  private loadedText = "";

  onStart(): void {
    this.ensureAssets();
  }

  setText(text: string): this {
    if (this.text === text) return this;
    this.text = text;
    this.releaseText();
    return this;
  }

  setFont(path: string, size: number): this {
    if (this.fontPath === path && this.fontSize === size) return this;
    this.releaseAssets();
    this.fontPath = path;
    this.fontSize = size;
    return this;
  }

  onRender(): void {
    this.ensureAssets();
    if (!this.textTexture) return;
    const t = this.node?.getComponent(Transform);
    if (!t) return;

    const width = this.textTexture.width * t.worldScaleX;
    const height = this.textTexture.height * t.worldScaleY;
    drawTextureRotated(
      this.textTexture.id,
      t.worldX - t.anchorX * width,
      t.worldY - t.anchorY * height,
      width,
      height,
      t.worldRotation,
      t.anchorX * width,
      t.anchorY * height,
      false,
      false,
      this.color.r,
      this.color.g,
      this.color.b,
      this.opacity * (this.color.a ?? 255),
    );
  }

  onDestroy(): void {
    this.releaseAssets();
  }

  private ensureAssets(): void {
    if (!this.fontPath || !this.text) {
      this.releaseText();
      return;
    }

    const fontKey = `${this.fontPath}\0${this.fontSize}`;
    if (!this.font || this.loadedFontKey !== fontKey) {
      this.releaseAssets();
      this.font = AssetManager.acquireFont(this.fontPath, this.fontSize);
      this.fontId = this.font.id;
      this.loadedFontKey = fontKey;
    }
    if (!this.textTexture || this.loadedText !== this.text) {
      this.releaseText();
      this.textTexture = AssetManager.acquireText(this.font, this.text);
      this.loadedText = this.text;
    }
  }

  private releaseText(): void {
    this.textTexture?.release();
    this.textTexture = null;
    this.loadedText = "";
  }

  private releaseAssets(): void {
    this.releaseText();
    this.font?.release();
    this.font = null;
    this.fontId = -1;
    this.loadedFontKey = "";
  }
}
