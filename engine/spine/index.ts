import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Physics,
  RegionAttachment,
  Skeleton,
  SkeletonJson,
  Texture,
  TextureAtlas,
  TextureFilter,
  TextureWrap,
  type TrackEntry,
} from "@esotericsoftware/spine-core";
import { drawTextureRegionRotated, loadTextFile } from "sdl3";
import { AssetManager, type TextureAsset } from "../AssetManager";
import { Component } from "../core/Component";

export interface SpineData {
  atlas: string
  skeleton: string
  texture?: string
}

export interface SpineSkeletonProps {
  data: SpineData
  skin?: string
  animation?: string
  timeScale?: number
  loop?: boolean
  onAnimationComplete?: (animationName?: string, loopCount?: number) => void
}

interface LoadedSpineData {
  key: string;
  atlas: TextureAtlas;
  skeleton: any;
  textures: SdlSpineTexture[];
}

class SdlSpineTexture extends Texture {
  constructor(readonly asset: TextureAsset) {
    super(asset);
  }

  setFilters(_minFilter: TextureFilter, _magFilter: TextureFilter): void {}
  setWraps(_uWrap: TextureWrap, _vWrap: TextureWrap): void {}

  dispose(): void {
    this.asset.release();
  }
}

export class SpineSkeleton extends Component<SpineSkeletonProps> {
  private skeleton: Skeleton | null = null;
  private state: AnimationState | null = null;
  private textures: SdlSpineTexture[] = [];
  private loadedKey = "";
  private loadVersion = 0;
  private worldVertices = new Float32Array(8);

  onStart(): void {
    void this.reload().catch((error) => {
      console.error("Spine reload failed", error);
    });
  }

  onUpdate(dt: number): void {
    if (!this.skeleton || !this.state) return;
    this.state.timeScale = this.props.timeScale ?? 1;
    this.state.update(dt);
    this.state.apply(this.skeleton);
    this.skeleton.update(dt);
    this.skeleton.updateWorldTransform(Physics.update);
  }

  onRender(): void {
    if (!this.node?.visible || !this.skeleton) return;

    const drawOrder = this.skeleton.drawOrder.appliedPose;
    for (let i = 0; i < drawOrder.length; i++) {
      const slot = drawOrder[i];
      const attachment = slot.appliedPose.attachment;
      if (!(attachment instanceof RegionAttachment) || !slot.bone.active) continue;

      const pose = slot.appliedPose;
      const sequenceIndex = attachment.sequence.resolveIndex(pose);
      const region = attachment.sequence.regions[sequenceIndex];
      const texture = region?.texture as SdlSpineTexture | null | undefined;
      if (!region || !texture) continue;

      attachment.computeWorldVertices(
        slot,
        attachment.getOffsets(pose),
        this.worldVertices,
        0,
        2,
      );
      this.renderRegion(attachment, slot, region, texture.asset);
    }
  }

  onDestroy(): void {
    this.disposeSkeleton();
  }

  async reload(): Promise<void> {
    const data = this.props.data;
    if (!data) return;

    const version = ++this.loadVersion;
    const loaded = await loadSpineData(data);
    if (version !== this.loadVersion) {
      loaded.atlas.dispose();
      return;
    }

    this.disposeSkeleton();
    this.loadedKey = loaded.key;
    this.textures = loaded.textures;

    Skeleton.yDown = true;
    const loader = new AtlasAttachmentLoader(loaded.atlas);
    const parser = new SkeletonJson(loader);
    const skeletonData = parser.readSkeletonData(loaded.skeleton);

    this.skeleton = new Skeleton(skeletonData);
    if (this.props.skin) this.skeleton.setSkin(this.props.skin);
    this.skeleton.setupPose();

    this.state = new AnimationState(new AnimationStateData(skeletonData));
    this.state.addListener({
      complete: (entry: TrackEntry) => {
        this.props.onAnimationComplete?.call(
          this,
          entry.animation?.name,
          Math.floor(entry.trackTime / Math.max(entry.animationEnd - entry.animationStart, 1e-6)),
        );
      },
    });
    this.play(this.props.animation, this.props.loop);

    this.state.apply(this.skeleton);
    this.skeleton.updateWorldTransform(Physics.update);
  }

  play(animation = this.props.animation, loop = this.props.loop): void {
    if (!this.state || !animation) return;
    this.state.setAnimation(0, animation, loop ?? true);
  }

  private renderRegion(
    attachment: RegionAttachment,
    slot: any,
    region: any,
    texture: TextureAsset,
  ): void {
    const vertices = this.worldVertices;
    const topLeft = transformPoint(this, vertices[4], vertices[5]);
    const topRight = transformPoint(this, vertices[6], vertices[7]);
    const bottomLeft = transformPoint(this, vertices[2], vertices[3]);
    const width = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
    const height = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
    if (width <= 0 || height <= 0) return;

    const angle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x) * 180 / Math.PI;
    const skeletonColor = this.skeleton?.color;
    const slotColor = slot.appliedPose.color;
    const attachmentColor = attachment.color;
    const red = 255 * (skeletonColor?.r ?? 1) * slotColor.r * attachmentColor.r;
    const green = 255 * (skeletonColor?.g ?? 1) * slotColor.g * attachmentColor.g;
    const blue = 255 * (skeletonColor?.b ?? 1) * slotColor.b * attachmentColor.b;
    const alpha = 255 *
      (skeletonColor?.a ?? 1) *
      slotColor.a *
      attachmentColor.a *
      (this.node?.opacity ?? 1);

    drawTextureRegionRotated(
      texture.id,
      region.x,
      region.y,
      region.width,
      region.height,
      topLeft.x,
      topLeft.y,
      width,
      height,
      angle,
      0,
      0,
      false,
      false,
      red,
      green,
      blue,
      alpha,
    );
  }

  private disposeSkeleton(): void {
    this.loadVersion++;
    this.state?.clearListeners();
    this.state?.clearTracks();
    this.state = null;
    this.skeleton = null;
    if (this.loadedKey) {
      for (const texture of this.textures) texture.dispose();
    }
    this.textures = [];
    this.loadedKey = "";
  }
}

const textCache = new Map<string, Promise<string>>();
const jsonCache = new Map<string, Promise<any>>();

async function loadSpineData(data: SpineData): Promise<LoadedSpineData> {
  const [atlasText, skeleton] = await Promise.all([
    loadText(data.atlas),
    loadJson(data.skeleton),
  ]);
  const atlas = new TextureAtlas(atlasText);
  const textures = atlas.pages.map((page) => {
    const path = data.texture ?? resolveSiblingPath(data.atlas, page.name);
    const texture = new SdlSpineTexture(AssetManager.acquireTexture(path));
    page.setTexture(texture);
    return texture;
  });

  return {
    key: `${data.skeleton}\0${data.atlas}\0${data.texture ?? ""}`,
    atlas,
    skeleton,
    textures,
  };
}

function loadJson(path: string): Promise<any> {
  let promise = jsonCache.get(path);
  if (!promise) {
    promise = loadText(path).then((text) => JSON.parse(text));
    jsonCache.set(path, promise);
  }
  return promise;
}

function loadText(path: string): Promise<string> {
  let promise = textCache.get(path);
  if (!promise) {
    if (typeof fetch === "function") {
      promise = fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Failed to load Spine file: ${path}`);
        return response.text();
      });
    } else {
      const text = loadTextFile(path);
      if (text === null) throw new Error(`Failed to load Spine file: ${path}`);
      promise = Promise.resolve(text);
    }
    textCache.set(path, promise);
  }
  return promise;
}

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling;
}

export { SpineSkeleton as Spine };

function transformPoint(root: SpineSkeleton, x: number, y: number): { x: number; y: number } {
  const node = root.node;
  if (!node) return { x, y };

  const radians = node.worldRotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const scaledX = x * node.worldScaleX;
  const scaledY = y * node.worldScaleY;
  return {
    x: node.worldX + scaledX * cos - scaledY * sin,
    y: node.worldY + scaledX * sin + scaledY * cos,
  };
}
