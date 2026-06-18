import {
    drawRect,
    drawTextureRegionRotated,
    popClipRect,
    pushClipRect,
} from "sdl3";
import type { Color } from "../animation/Tween";
import { AssetManager, TextureAsset, TextureRegion } from "../AssetManager";
import { ComponentX } from "../core/ComponentX";
import type { Node } from "../core/Node";
import type { InputEvent } from "../Input";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type LayoutDirection = "none" | "horizontal" | "vertical";
export type LayoutAlignment = "start" | "center" | "end" | "stretch";

const zeroInsets = (): Insets => ({ top: 0, right: 0, bottom: 0, left: 0 });
const white = (): Color => ({ r: 255, g: 255, b: 255, a: 255 });

export class UIElement extends ComponentX {
  width = 100;
  height = 100;
  minWidth = 0;
  minHeight = 0;
  maxWidth = Number.POSITIVE_INFINITY;
  maxHeight = Number.POSITIVE_INFINITY;
  flex = 0;
  margin: Insets = zeroInsets();
  anchorMinX: number | null = null;
  anchorMinY: number | null = null;
  anchorMaxX: number | null = null;
  anchorMaxY: number | null = null;
  offsetLeft = 0;
  offsetTop = 0;
  offsetRight = 0;
  offsetBottom = 0;

  onUpdate(_dt: number): void {
    this.applyAnchors();
    this.clampSize();
  }

  setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }

  setAnchors(
    minX: number,
    minY: number,
    maxX: number = minX,
    maxY: number = minY,
  ): this {
    this.anchorMinX = minX;
    this.anchorMinY = minY;
    this.anchorMaxX = maxX;
    this.anchorMaxY = maxY;
    return this;
  }

  protected applyAnchors(): void {
    if (this.anchorMinX === null || this.anchorMinY === null || !this.node) return;
    const parent = findUIElement(this.node.parent);
    if (!parent) return;

    const maxX = this.anchorMaxX ?? this.anchorMinX;
    const maxY = this.anchorMaxY ?? this.anchorMinY;
    const parentTransform = parent.node!.transform;
    const originX = -parentTransform.anchorX * parent.width;
    const originY = -parentTransform.anchorY * parent.height;
    const left = originX + parent.width * this.anchorMinX + this.offsetLeft;
    const top = originY + parent.height * this.anchorMinY + this.offsetTop;
    const right = originX + parent.width * maxX - this.offsetRight;
    const bottom = originY + parent.height * maxY - this.offsetBottom;
    const transform = this.node.transform;

    if (maxX !== this.anchorMinX) this.width = right - left;
    if (maxY !== this.anchorMinY) this.height = bottom - top;
    transform.x = left + this.width * transform.anchorX;
    transform.y = top + this.height * transform.anchorY;
  }

  protected clampSize(): void {
    this.width = Math.max(this.minWidth, Math.min(this.maxWidth, this.width));
    this.height = Math.max(this.minHeight, Math.min(this.maxHeight, this.height));
  }

  protected worldRect(): { x: number; y: number; width: number; height: number } {
    const t = this.node!.transform;
    const width = this.width * Math.abs(t.worldScaleX);
    const height = this.height * Math.abs(t.worldScaleY);
    return {
      x: t.worldX - t.anchorX * width,
      y: t.worldY - t.anchorY * height,
      width,
      height,
    };
  }

  protected containsPoint(x: number, y: number): boolean {
    const rect = this.worldRect();
    return x >= rect.x && x <= rect.x + rect.width &&
      y >= rect.y && y <= rect.y + rect.height;
  }
}

export class UIContainer extends UIElement {
  direction: LayoutDirection = "none";
  gap = 0;
  padding: Insets = zeroInsets();
  align: LayoutAlignment = "start";

  onUpdate(dt: number): void {
    super.onUpdate(dt);
    if (this.direction !== "none") this.layoutChildren();
  }

  layoutChildren(): void {
    if (!this.node) return;
    const horizontal = this.direction === "horizontal";
    const originX = -this.node.transform.anchorX * this.width;
    const originY = -this.node.transform.anchorY * this.height;
    const items = this.node.children
      .map((node) => ({ node, element: findUIElement(node) }))
      .filter((item): item is { node: Node; element: UIElement } => !!item.element);
    if (items.length === 0) return;

    const mainSize = horizontal ? this.width : this.height;
    const leading = horizontal ? this.padding.left : this.padding.top;
    const trailing = horizontal ? this.padding.right : this.padding.bottom;
    const fixed = items.reduce((sum, { element }) => {
      const size = horizontal ? element.width : element.height;
      const margin = horizontal
        ? element.margin.left + element.margin.right
        : element.margin.top + element.margin.bottom;
      return sum + (element.flex > 0 ? margin : size + margin);
    }, this.gap * Math.max(0, items.length - 1));
    const totalFlex = items.reduce((sum, item) => sum + item.element.flex, 0);
    const remaining = Math.max(0, mainSize - leading - trailing - fixed);
    let cursor = leading;

    for (const { node, element } of items) {
      const marginBefore = horizontal ? element.margin.left : element.margin.top;
      const marginAfter = horizontal ? element.margin.right : element.margin.bottom;
      cursor += marginBefore;
      if (element.flex > 0 && totalFlex > 0) {
        if (horizontal) element.width = remaining * element.flex / totalFlex;
        else element.height = remaining * element.flex / totalFlex;
      }

      const crossStart = horizontal ? this.padding.top : this.padding.left;
      const crossEnd = horizontal ? this.padding.bottom : this.padding.right;
      const crossAvailable = (horizontal ? this.height : this.width) -
        crossStart - crossEnd;
      const crossSize = horizontal ? element.height : element.width;
      let cross = crossStart;
      if (this.align === "center") cross += (crossAvailable - crossSize) * 0.5;
      if (this.align === "end") cross += crossAvailable - crossSize;
      if (this.align === "stretch") {
        if (horizontal) element.height = crossAvailable;
        else element.width = crossAvailable;
      }

      const t = node.transform;
      if (horizontal) {
        t.x = originX + cursor + element.width * t.anchorX;
        t.y = originY + cross + element.height * t.anchorY;
        cursor += element.width + marginAfter + this.gap;
      } else {
        t.x = originX + cross + element.width * t.anchorX;
        t.y = originY + cursor + element.height * t.anchorY;
        cursor += element.height + marginAfter + this.gap;
      }
    }
  }
}

export class Panel extends UIContainer {
  color: Color = { r: 30, g: 41, b: 59, a: 255 };
  opacity = 1;

  onRender(): void {
    const rect = this.worldRect();
    drawRect(rect.x, rect.y, rect.width, rect.height,
      this.color.r, this.color.g, this.color.b,
      this.opacity * (this.color.a ?? 255));
  }
}

export class NineSlice extends UIElement {
  texturePath = "";
  region: TextureRegion | null = null;
  border: Insets = { top: 12, right: 12, bottom: 12, left: 12 };
  color: Color = white();
  opacity = 1;
  private texture: TextureAsset | null = null;
  private loadedPath = "";

  setTexture(path: string, region: TextureRegion | null = null): this {
    if (path !== this.texturePath) this.releaseTexture();
    this.texturePath = path;
    this.region = region;
    return this;
  }

  onRender(): void {
    this.ensureTexture();
    if (!this.texture) return;
    const source = this.region ?? {
      x: 0, y: 0, width: this.texture.width, height: this.texture.height,
    };
    const rect = this.worldRect();
    const sourceW = splitSize(source.width, this.border.left, this.border.right);
    const sourceH = splitSize(source.height, this.border.top, this.border.bottom);
    const sourceX = [source.x, source.x + sourceW[0],
      source.x + source.width - sourceW[2]];
    const sourceY = [source.y, source.y + sourceH[0],
      source.y + source.height - sourceH[2]];
    const destW = splitSize(rect.width, sourceW[0], sourceW[2]);
    const destH = splitSize(rect.height, sourceH[0], sourceH[2]);
    let dy = rect.y;
    for (let row = 0; row < 3; row++) {
      let dx = rect.x;
      for (let column = 0; column < 3; column++) {
        if (sourceW[column] > 0 && sourceH[row] > 0 &&
          destW[column] > 0 && destH[row] > 0) {
          drawTextureRegionRotated(
            this.texture.id,
            sourceX[column], sourceY[row], sourceW[column], sourceH[row],
            dx, dy, destW[column], destH[row],
            0, 0, 0, false, false,
            this.color.r, this.color.g, this.color.b,
            this.opacity * (this.color.a ?? 255),
          );
        }
        dx += destW[column];
      }
      dy += destH[row];
    }
  }

  onDestroy(): void {
    this.releaseTexture();
  }

  private ensureTexture(): void {
    if (!this.texturePath) {
      this.releaseTexture();
      return;
    }
    if (this.texture && this.loadedPath === this.texturePath) return;
    this.releaseTexture();
    this.texture = AssetManager.acquireTexture(this.texturePath);
    this.loadedPath = this.texturePath;
  }

  private releaseTexture(): void {
    this.texture?.release();
    this.texture = null;
    this.loadedPath = "";
  }
}

export class UIImage extends NineSlice {
  border: Insets = zeroInsets();
}

export class ProgressBar extends UIElement {
  value = 0;
  min = 0;
  max = 1;
  backgroundColor: Color = { r: 51, g: 65, b: 85, a: 255 };
  fillColor: Color = { r: 34, g: 197, b: 94, a: 255 };
  vertical = false;
  reverse = false;

  setValue(value: number): this {
    this.value = Math.max(this.min, Math.min(this.max, value));
    return this;
  }

  onRender(): void {
    const rect = this.worldRect();
    drawRect(rect.x, rect.y, rect.width, rect.height,
      this.backgroundColor.r, this.backgroundColor.g, this.backgroundColor.b,
      this.backgroundColor.a ?? 255);
    const range = this.max - this.min;
    const ratio = range <= 0 ? 0 :
      Math.max(0, Math.min(1, (this.value - this.min) / range));
    const width = this.vertical ? rect.width : rect.width * ratio;
    const height = this.vertical ? rect.height * ratio : rect.height;
    const x = this.reverse && !this.vertical ? rect.x + rect.width - width : rect.x;
    const y = this.reverse && this.vertical ? rect.y + rect.height - height : rect.y;
    drawRect(x, y, width, height,
      this.fillColor.r, this.fillColor.g, this.fillColor.b,
      this.fillColor.a ?? 255);
  }
}

export class Toggle extends UIElement {
  checked = false;
  disabled = false;
  onChange: ((checked: boolean) => void) | null = null;
  trackOffColor: Color = { r: 71, g: 85, b: 105, a: 255 };
  trackOnColor: Color = { r: 59, g: 130, b: 246, a: 255 };
  thumbColor: Color = white();
  inputEnabled = true;
  private pressed = false;

  hitTest(x: number, y: number): boolean {
    return !this.disabled && this.containsPoint(x, y);
  }

  onPointerStart(event: InputEvent): void {
    this.pressed = true;
    event.stopPropagation();
  }

  onPointerEnd(event: InputEvent): void {
    if (this.pressed && this.containsPoint(event.x, event.y)) {
      this.checked = !this.checked;
      this.onChange?.(this.checked);
    }
    this.pressed = false;
    event.stopPropagation();
  }

  onRender(): void {
    const rect = this.worldRect();
    const color = this.checked ? this.trackOnColor : this.trackOffColor;
    drawRect(rect.x, rect.y, rect.width, rect.height,
      color.r, color.g, color.b, this.disabled ? 120 : color.a ?? 255);
    const thumb = Math.min(rect.height, rect.width * 0.5);
    const x = this.checked ? rect.x + rect.width - thumb : rect.x;
    drawRect(x, rect.y, thumb, rect.height,
      this.thumbColor.r, this.thumbColor.g, this.thumbColor.b,
      this.disabled ? 160 : this.thumbColor.a ?? 255);
  }
}

export class ScrollView extends UIContainer {
  scrollX = 0;
  scrollY = 0;
  contentWidth = 0;
  contentHeight = 0;
  horizontal = false;
  vertical = true;
  inputEnabled = true;
  inputPriority = 100;
  private dragX = 0;
  private dragY = 0;
  private startScrollX = 0;
  private startScrollY = 0;
  private dragged = false;

  onUpdate(dt: number): void {
    super.onUpdate(dt);
    this.clampScroll();
    const content = this.node?.children[0];
    if (content) {
      content.transform.x = -this.node!.transform.anchorX * this.width -
        this.scrollX;
      content.transform.y = -this.node!.transform.anchorY * this.height -
        this.scrollY;
    }
  }

  onRender(): void {
    const rect = this.worldRect();
    pushClipRect(rect.x, rect.y, rect.width, rect.height);
  }

  onRenderEnd(): void {
    popClipRect();
  }

  hitTest(x: number, y: number): boolean {
    return this.containsPoint(x, y);
  }

  allowsDescendantInput(x: number, y: number): boolean {
    return this.containsPoint(x, y);
  }

  onPointerStart(event: InputEvent): void {
    this.dragX = event.x;
    this.dragY = event.y;
    this.startScrollX = this.scrollX;
    this.startScrollY = this.scrollY;
    this.dragged = false;
  }

  onPointerMove(event: InputEvent): void {
    this.dragged = this.dragged ||
      Math.abs(event.x - this.dragX) > 4 ||
      Math.abs(event.y - this.dragY) > 4;
    if (this.horizontal) this.scrollX = this.startScrollX - (event.x - this.dragX);
    if (this.vertical) this.scrollY = this.startScrollY - (event.y - this.dragY);
    this.clampScroll();
    if (this.dragged) event.stopPropagation();
  }

  onPointerEnd(event: InputEvent): void {
    if (this.dragged) event.stopPropagation();
  }

  scrollTo(x: number, y: number): this {
    this.scrollX = x;
    this.scrollY = y;
    this.clampScroll();
    return this;
  }

  private clampScroll(): void {
    this.scrollX = Math.max(0, Math.min(
      Math.max(0, this.contentWidth - this.width), this.scrollX));
    this.scrollY = Math.max(0, Math.min(
      Math.max(0, this.contentHeight - this.height), this.scrollY));
  }
}

function findUIElement(node: Node | null): UIElement | null {
  if (!node) return null;
  for (const component of node.components) {
    if (component instanceof UIElement) return component;
  }
  return null;
}

function splitSize(total: number, leading: number, trailing: number):
  [number, number, number] {
  const edgeTotal = leading + trailing;
  if (edgeTotal <= total) return [leading, total - edgeTotal, trailing];
  if (edgeTotal <= 0) return [0, total, 0];
  const scale = total / edgeTotal;
  return [leading * scale, 0, trailing * scale];
}
