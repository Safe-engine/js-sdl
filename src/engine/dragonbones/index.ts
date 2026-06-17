import {
    Armature,
    BaseFactory,
    BaseObject,
    DragonBones as DragonBonesRuntime,
    EventObject,
    Slot,
    TextureAtlasData,
    TextureData,
    type Animation,
    type BuildArmaturePackage,
    type EventStringType,
    type IArmatureProxy,
    type Matrix,
    type SlotData,
} from "dragonbones-es";
import { drawTextureRegionRotated, loadTextFile } from "sdl3";
import { AssetManager, type TextureAsset } from "../AssetManager";
import { Component } from "../core/Component";

export type Integer = number;
export type Float = number;

export interface DragonBonesData {
  atlas: string;
  skeleton: string;
  texture: string;
}

export interface DragonBonesProps {
  data: DragonBonesData;
  skin?: string;
  animation?: string;
  playTimes?: Integer;
  timeScale?: Float;

  onAnimationStart?: (animationName?: string) => void;
  onAnimationEnd?: (animationName?: string) => void;
  onAnimationComplete?: (animationName?: string, loopCount?: number) => void;
}

interface LoadedDragonBonesData {
  key: string;
  skeleton: any;
  atlas: any;
  texture: TextureAsset;
}

class SdlTextureAtlasData extends TextureAtlasData {
  texture: TextureAsset | null = null;

  static toString(): string {
    return "[class SdlTextureAtlasData]";
  }

  createTexture(): TextureData {
    return BaseObject.borrowObject(SdlTextureData);
  }

  protected _onClear(): void {
    super._onClear();
    this.texture?.release();
    this.texture = null;
  }
}

class SdlTextureData extends TextureData {
  static toString(): string {
    return "[class SdlTextureData]";
  }
}

class SdlDisplay {
  textureData: SdlTextureData | null = null;
  matrix: Matrix | null = null;
  pivotX = 0;
  pivotY = 0;
  visible = true;
  alpha = 1;
  red = 255;
  green = 255;
  blue = 255;
  zOrder = 0;
}

class SdlArmatureDisplay implements IArmatureProxy {
  private _armature: Armature | null = null;
  private readonly listeners = new Map<EventStringType, Array<{ listener: Function; thisObject: any }>>();

  dbInit(armature: Armature): void {
    this._armature = armature;
  }

  dbClear(): void {
    this.listeners.clear();
    this._armature = null;
  }

  dbUpdate(): void {}

  dispose(disposeProxy: boolean): void {
    if (!disposeProxy) return;
    this._armature?.dispose();
    this.dbClear();
  }

  hasDBEventListener(type: EventStringType): boolean {
    return (this.listeners.get(type)?.length ?? 0) > 0;
  }

  dispatchDBEvent(type: EventStringType, eventObject: EventObject): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    for (const item of listeners) {
      item.listener.call(item.thisObject, eventObject);
    }
  }

  addDBEventListener(type: EventStringType, listener: Function, thisObject: any): void {
    const listeners = this.listeners.get(type) ?? [];
    if (!listeners.some((item) => item.listener === listener && item.thisObject === thisObject)) {
      listeners.push({ listener, thisObject });
    }
    this.listeners.set(type, listeners);
  }

  removeDBEventListener(type: EventStringType, listener: Function, thisObject: any): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    this.listeners.set(
      type,
      listeners.filter((item) => item.listener !== listener || item.thisObject !== thisObject),
    );
  }

  get armature(): Armature {
    if (!this._armature) throw new Error("DragonBones armature display is not initialized.");
    return this._armature;
  }

  get animation(): Animation {
    return this.armature.animation;
  }
}

class SdlSlot extends Slot {
  static toString(): string {
    return "[class SdlSlot]";
  }

  protected _initDisplay(_value: SdlDisplay, _isRetain: boolean): void {}
  protected _disposeDisplay(_value: SdlDisplay, _isRelease: boolean): void {}
  protected _onUpdateDisplay(): void {}
  protected _addDisplay(): void {}
  protected _replaceDisplay(_value: SdlDisplay): void {}
  protected _removeDisplay(): void {}

  protected _updateZOrder(): void {
    this.currentDisplay().zOrder = (this as any)._zOrder;
  }

  _updateVisible(): void {
    this.currentDisplay().visible = (this as any)._visible;
  }

  protected _updateBlendMode(): void {}

  protected _updateColor(): void {
    const display = this.currentDisplay();
    const color = (this as any)._colorTransform;
    display.alpha = Math.max(0, Math.min(1, ((this as any)._globalAlpha ?? 1) * color.alphaMultiplier));
    display.red = Math.max(0, Math.min(255, 255 * color.redMultiplier + color.redOffset));
    display.green = Math.max(0, Math.min(255, 255 * color.greenMultiplier + color.greenOffset));
    display.blue = Math.max(0, Math.min(255, 255 * color.blueMultiplier + color.blueOffset));
  }

  protected _updateFrame(): void {
    const display = this.currentDisplay();
    display.textureData = ((this as any)._textureData ?? null) as SdlTextureData | null;
  }

  protected _updateMesh(): void {
    this._updateFrame();
  }

  protected _updateTransform(): void {
    const display = this.currentDisplay();
    display.matrix = this.globalTransformMatrix;
    display.pivotX = (this as any)._pivotX;
    display.pivotY = (this as any)._pivotY;
  }

  protected _identityTransform(): void {
    const display = this.currentDisplay();
    display.matrix = null;
    display.pivotX = 0;
    display.pivotY = 0;
  }

  render(root: DragonBones): void {
    const display = this.currentDisplay();
    const textureData = display.textureData;
    const texture = (textureData?.parent as SdlTextureAtlasData | undefined)?.texture;
    if (!display.visible || !textureData || !texture || !display.matrix) return;

    const region = textureData.region;
    const sourceWidth = textureData.rotated ? region.height : region.width;
    const sourceHeight = textureData.rotated ? region.width : region.height;
    const matrix = composeMatrix(root, display.matrix);
    const scaleX = Math.hypot(matrix.a, matrix.b);
    const scaleY = Math.hypot(matrix.c, matrix.d);
    const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    const width = sourceWidth * scaleX;
    const height = sourceHeight * scaleY;
    const centerX = display.pivotX * scaleX;
    const centerY = display.pivotY * scaleY;

    drawTextureRegionRotated(
      texture.id,
      region.x,
      region.y,
      region.width,
      region.height,
      matrix.tx - centerX,
      matrix.ty - centerY,
      width,
      height,
      rotation,
      centerX,
      centerY,
      false,
      false,
      display.red,
      display.green,
      display.blue,
      root.node.opacity * display.alpha * 255,
    );
  }

  private currentDisplay(): SdlDisplay {
    return (((this as any)._display ?? (this as any)._rawDisplay) as SdlDisplay);
  }
}

class SdlFactory extends BaseFactory {
  constructor(eventManager: SdlArmatureDisplay) {
    super();
    (this as any)._dragonBones = new DragonBonesRuntime(eventManager);
  }

  protected _buildTextureAtlasData(
    textureAtlasData: SdlTextureAtlasData | null,
    textureAtlas: TextureAsset | null,
  ): SdlTextureAtlasData {
    const atlasData = textureAtlasData ?? BaseObject.borrowObject(SdlTextureAtlasData);
    if (textureAtlas && atlasData.texture !== textureAtlas) {
      atlasData.texture?.release();
      atlasData.texture = textureAtlas;
    }
    return atlasData;
  }

  protected _buildArmature(dataPackage: BuildArmaturePackage): Armature {
    const armature = BaseObject.borrowObject(Armature);
    const display = new SdlArmatureDisplay();
    armature.init(dataPackage.armature, display, display, (this as any)._dragonBones);
    return armature;
  }

  protected _buildSlot(_dataPackage: BuildArmaturePackage, slotData: SlotData, armature: Armature): Slot {
    const slot = BaseObject.borrowObject(SdlSlot);
    slot.init(slotData, armature, new SdlDisplay(), new SdlDisplay());
    return slot;
  }

  parseData(skeleton: any, atlas: any, texture: TextureAsset, key: string): void {
    const dragonBonesData = (this as any)._dataParser.parseDragonBonesData(skeleton, 1);
    if (!dragonBonesData) {
      throw new Error(`Failed to parse DragonBones skeleton: ${key}`);
    }

    this.addDragonBonesData(dragonBonesData, key);
    this.parseTextureAtlasData(atlas, texture, key);
  }

  advanceTime(passedTime: number): void {
    (this as any)._dragonBones.advanceTime(passedTime);
  }
}

export class DragonBones extends Component<DragonBonesProps> {
  private factory: SdlFactory | null = null;
  private armature: Armature | null = null;
  private loadedKey = "";
  private loadVersion = 0;
  private completedLoops = 0;
  private animationEnded = false;

  onStart(): void {
    void this.reload().catch((error) => {
      console.error("DragonBones reload failed", error);
    });
  }

  onUpdate(dt: number): void {
    if (this.armature) {
      this.armature.animation.timeScale = this.props.timeScale ?? 1;
    }
    this.factory?.advanceTime(dt);
    this.syncAnimationCallbacks();
  }

  onRender(): void {
    if (!this.node.visible || !this.armature) return;
    for (const slot of this.armature.getSlots()) {
      if (slot instanceof SdlSlot) slot.render(this);
    }
  }

  onDestroy(): void {
    this.disposeArmature();
  }

  async reload(): Promise<void> {
    const data = this.props.data;
    if (!data) return;

    const version = ++this.loadVersion;
    const loaded = await loadDragonBonesData(data);
    if (version !== this.loadVersion) {
      loaded.texture.release();
      return;
    }

    this.disposeArmature();
    this.loadedKey = loaded.key;
    this.factory = new SdlFactory(new SdlArmatureDisplay());
    this.factory.parseData(loaded.skeleton, loaded.atlas, loaded.texture, loaded.key);
    this.armature = this.factory.buildArmature(
      this.factory.getDragonBonesData(loaded.key)?.armatureNames[0] ?? "",
      loaded.key,
      this.props.skin ?? "",
      loaded.key,
    );

    if (!this.armature) {
      loaded.texture.release();
      throw new Error(`Failed to build DragonBones armature for ${loaded.key}.`);
    }

    this.armature.clock = this.factory.clock;
    this.bindAnimationEvents();
    this.play(this.props.animation, this.props.playTimes);
  }

  play(animation = this.props.animation, playTimes = this.props.playTimes): void {
    if (!this.armature) return;
    this.completedLoops = 0;
    this.animationEnded = false;
    this.armature.animation.timeScale = this.props.timeScale ?? 1;
    this.armature.animation.play(animation ?? null, playTimes ?? -1);
  }

  private bindAnimationEvents(): void {
    const display = this.armature?.display as SdlArmatureDisplay | undefined;
    if (!display) return;

    display.addDBEventListener(EventObject.START, (event: EventObject) => {
      this.props.onAnimationStart?.call(this, event.animationState?.name);
    }, this);
    display.addDBEventListener(EventObject.LOOP_COMPLETE, (event: EventObject) => {
      this.emitAnimationComplete(
        event.animationState?.name,
        event.animationState?.currentPlayTimes,
      );
    }, this);
    display.addDBEventListener(EventObject.COMPLETE, (event: EventObject) => {
      if (this.animationEnded) return;
      this.animationEnded = true;
      this.props.onAnimationEnd?.call(this, event.animationState?.name);
    }, this);
  }

  private syncAnimationCallbacks(): void {
    if (!this.armature) return;
    for (const state of this.armature.animation.getStates()) {
      if (state.currentPlayTimes > this.completedLoops) {
        this.emitAnimationComplete(state.name, state.currentPlayTimes);
      }
      if (state.isCompleted && !this.animationEnded) {
        this.animationEnded = true;
        this.props.onAnimationEnd?.call(this, state.name);
      }
    }
  }

  private emitAnimationComplete(animationName?: string, loopCount = 0): void {
    if (loopCount <= this.completedLoops) return;
    this.completedLoops = loopCount;
    this.props.onAnimationComplete?.call(this, animationName, loopCount);
  }

  private disposeArmature(): void {
    this.loadVersion++;
    this.armature?.dispose();
    this.armature = null;
    if (this.factory && this.loadedKey) {
      this.factory.removeDragonBonesData(this.loadedKey, true);
      this.factory.removeTextureAtlasData(this.loadedKey, true);
    }
    this.factory = null;
    this.loadedKey = "";
  }
}

const jsonCache = new Map<string, Promise<any>>();

async function loadDragonBonesData(data: DragonBonesData): Promise<LoadedDragonBonesData> {
  const [skeleton, atlas] = await Promise.all([
    loadJson(data.skeleton),
    loadJson(data.atlas),
  ]);

  return {
    key: `${data.skeleton}\0${data.atlas}\0${data.texture}`,
    skeleton,
    atlas,
    texture: AssetManager.acquireTexture(data.texture),
  };
}

function loadJson(path: string): Promise<any> {
  let promise = jsonCache.get(path);
  if (!promise) {
    if (typeof fetch === "function") {
      promise = fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Failed to load DragonBones JSON: ${path}`);
        return response.json();
      });
    } else {
      const text = loadTextFile(path);
      if (text === null) {
        throw new Error(`Failed to load DragonBones JSON: ${path}`);
      }
      promise = Promise.resolve(JSON.parse(text));
    }
    jsonCache.set(path, promise);
  }
  return promise;
}

function composeMatrix(root: DragonBones, local: Matrix): Matrix {
  const node = root.node;
  const radians = node.worldRotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const na = cos * node.worldScaleX;
  const nb = sin * node.worldScaleX;
  const nc = -sin * node.worldScaleY;
  const nd = cos * node.worldScaleY;

  return {
    a: na * local.a + nc * local.b,
    b: nb * local.a + nd * local.b,
    c: na * local.c + nc * local.d,
    d: nb * local.c + nd * local.d,
    tx: node.worldX + na * local.tx + nc * local.ty,
    ty: node.worldY + nb * local.tx + nd * local.ty,
  } as Matrix;
}
