import { Component } from "../core/Component";
import { Transform } from "../core/Transform";
import { loadTexture, drawTextureRotated } from "sdl3";

export class Sprite extends Component {
  texturePath = "";
  textureId = -1;
  width = 64;
  height = 64;
  flipX = false;
  flipY = false;
  visible = true;

  /** Load texture on start. */
  onStart(): void {
    if (this.texturePath) {
      this.textureId = loadTexture(this.texturePath);
    }
  }

  onRender(): void {
    if (!this.visible || this.textureId < 0) return;
    const t = this.node?.getComponent(Transform);
    if (!t) return;

    const w = this.width * t.scaleX;
    const h = this.height * t.scaleY;
    const dx = t.worldX - t.anchorX * w;
    const dy = t.worldY - t.anchorY * h;

    drawTextureRotated(
      this.textureId,
      dx, dy,
      w, h,
      t.rotation,
      this.flipX, this.flipY
    );
  }
}
