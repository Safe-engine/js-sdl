import { Component } from "../core/Component";
import { Transform } from "../core/Transform";
import { loadFont, drawLabelTTF } from "sdl3";

export class Label extends Component {
  text = "";
  fontPath = "";
  fontSize = 24;
  fontId = -1;

  onStart(): void {
    if (this.fontPath) {
      this.fontId = loadFont(this.fontPath, this.fontSize);
    }
  }

  setText(text: string): this {
    this.text = text;
    return this;
  }

  setFont(path: string, size: number): this {
    this.fontPath = path;
    this.fontSize = size;
    return this;
  }

  onRender(): void {
    if (this.fontId < 0 || !this.text) return;
    const t = this.node?.getComponent(Transform);
    if (!t) return;
    drawLabelTTF(
      this.fontId,
      this.text,
      t.worldX,
      t.worldY,
      t.anchorX,
      t.anchorY,
      t.worldScaleX,
      t.worldScaleY,
      t.worldRotation,
    );
  }
}
