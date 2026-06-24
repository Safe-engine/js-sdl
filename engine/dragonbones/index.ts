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
} from 'dragonbones-es';
import { drawTextureQuad, drawTextureRegionRotated, loadTextFile } from 'sdl3';
import { AssetManager, type TextureAsset } from '../AssetManager';
import { ComponentX } from '../core/ComponentX';

export interface DragonBonesData {
  atlas: string
  skeleton: string
  texture: string
}

export interface DragonBonesProps {
  data: DragonBonesData
  skin?: string
  animation?: string
  playTimes?: Integer
  timeScale?: Float

  onAnimationStart?: (animationName?: string) => void
  onAnimationEnd?: (animationName?: string) => void
  onAnimationComplete?: (animationName?: string, loopCount?: number) => void
}

interface LoadedDragonBonesData {
  key: string
  skeleton: any
  atlas: any
  texture: TextureAsset
}

class SdlTextureAtlasData extends TextureAtlasData {
  texture: TextureAsset | null = null;

  static toString(): string {
    return '[class SdlTextureAtlasData]';
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
    return '[class SdlTextureData]';
  }
}

class SdlDisplay {
  textureData: SdlTextureData | null = null;
  matrix: Matrix | null = null;
  meshVertices: Float32Array | null = null;
  meshUVs: Float32Array | null = null;
  meshTriangles: Int16Array | null = null;
  meshInArmatureSpace = false;
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
  private readonly listeners = new Map<EventStringType, Array<{ listener: Function, thisObject: any }>>();

  dbInit(armature: Armature): void {
    this._armature = armature;
  }

  dbClear(): void {
    this.listeners.clear();
    this._armature = null;
  }

  dbUpdate(): void { }

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
    if (!listeners.some(item => item.listener === listener && item.thisObject === thisObject)) {
      listeners.push({ listener, thisObject });
    }
    this.listeners.set(type, listeners);
  }

  removeDBEventListener(type: EventStringType, listener: Function, thisObject: any): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    this.listeners.set(
      type,
      listeners.filter(item => item.listener !== listener || item.thisObject !== thisObject),
    );
  }

  get armature(): Armature {
    if (!this._armature) throw new Error('DragonBones armature display is not initialized.');
    return this._armature;
  }

  get animation(): Animation {
    return this.armature.animation;
  }
}

class SdlSlot extends Slot {
  static toString(): string {
    return '[class SdlSlot]';
  }

  protected _initDisplay(_value: SdlDisplay, _isRetain: boolean): void { }
  protected _disposeDisplay(_value: SdlDisplay, _isRelease: boolean): void { }
  protected _onUpdateDisplay(): void { }
  protected _addDisplay(): void { }
  protected _replaceDisplay(_value: SdlDisplay): void { }
  protected _removeDisplay(): void { }

  protected _updateZOrder(): void {
    this.currentDisplay().zOrder = (this as any)._zOrder;
  }

  _updateVisible(): void {
    this.currentDisplay().visible = (this as any)._visible;
  }

  protected _updateBlendMode(): void { }

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
    this.updateMeshData(display, false);
  }

  protected _updateMesh(): void {
    const display = this.currentDisplay();
    display.textureData = ((this as any)._textureData ?? null) as SdlTextureData | null;
    this.updateMeshData(display, true);
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
    if (!display.visible || !textureData || !texture) return;

    const region = textureData.region;
    if (display.meshVertices && display.meshUVs && display.meshTriangles) {
      this.renderMesh(root, display, texture.id);
      return;
    }
    if (!display.matrix) return;

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

  private updateMeshData(display: SdlDisplay, updateVertices: boolean): void {
    const geometry = (this as any)._geometryData;
    const textureData = display.textureData;
    if (!geometry || !textureData) {
      display.meshVertices = null;
      display.meshUVs = null;
      display.meshTriangles = null;
      display.meshInArmatureSpace = false;
      return;
    }

    const intArray = geometry.data.intArray as Int16Array;
    const floatArray = geometry.data.floatArray as Float32Array;
    const vertexCount = intArray[geometry.offset];
    const triangleCount = intArray[geometry.offset + 1];
    const floatOffset = intArray[geometry.offset + 2];
    const indexOffset = geometry.offset + 4;
    const vertexLength = vertexCount * 2;
    const triangleLength = triangleCount * 3;

    if (!display.meshVertices || display.meshVertices.length !== vertexLength) {
      display.meshVertices = new Float32Array(vertexLength);
    }
    if (!display.meshUVs || display.meshUVs.length !== vertexLength) {
      display.meshUVs = new Float32Array(vertexLength);
    }
    this.copyMeshUVs(display.meshUVs, floatArray, floatOffset + vertexLength, vertexCount, textureData);
    if (!display.meshTriangles || display.meshTriangles.length !== triangleLength) {
      display.meshTriangles = new Int16Array(triangleLength);
      for (let i = 0; i < triangleLength; i++) {
        display.meshTriangles[i] = intArray[indexOffset + i];
      }
    }

    if (!updateVertices) return;

    const deformVertices = ((this as any)._displayFrame?.deformVertices ?? []) as number[];
    const weight = geometry.weight;
    display.meshInArmatureSpace = weight !== null;

    if (weight) {
      const weightOffset = weight.offset;
      const weightFloatOffset = intArray[weightOffset + 1];
      let boneIndexOffset = weightOffset + 2 + weight.bones.length;
      let weightedVertexOffset = weightFloatOffset;
      let deformOffset = 0;

      for (let i = 0; i < vertexLength; i += 2) {
        const boneCount = intArray[boneIndexOffset++];
        let x = 0;
        let y = 0;

        for (let j = 0; j < boneCount; j++) {
          const boneIndex = intArray[boneIndexOffset++];
          const bone = (this as any)._geometryBones[boneIndex];
          const matrix = bone?.globalTransformMatrix;
          const weightValue = floatArray[weightedVertexOffset++];
          const vx = floatArray[weightedVertexOffset++] + (deformVertices[deformOffset++] ?? 0);
          const vy = floatArray[weightedVertexOffset++] + (deformVertices[deformOffset++] ?? 0);
          if (!matrix) continue;

          x += (matrix.a * vx + matrix.c * vy + matrix.tx) * weightValue;
          y += (matrix.b * vx + matrix.d * vy + matrix.ty) * weightValue;
        }

        display.meshVertices[i] = x;
        display.meshVertices[i + 1] = y;
      }
    } else {
      for (let i = 0; i < vertexLength; i++) {
        display.meshVertices[i] = floatArray[floatOffset + i] + (deformVertices[i] ?? 0);
      }
    }
  }

  private copyMeshUVs(
    target: Float32Array,
    floatArray: Float32Array,
    uvOffset: number,
    vertexCount: number,
    textureData: SdlTextureData,
  ): void {
    const atlas = textureData.parent as SdlTextureAtlasData | null;
    const texture = atlas?.texture;
    const region = textureData.region;
    const width = texture?.width || 1;
    const height = texture?.height || 1;

    for (let i = 0; i < vertexCount; i++) {
      const source = uvOffset + i * 2;
      const targetIndex = i * 2;
      target[targetIndex] = (region.x + floatArray[source] * region.width) / width;
      target[targetIndex + 1] = (region.y + floatArray[source + 1] * region.height) / height;
    }
  }

  private renderMesh(root: DragonBones, display: SdlDisplay, textureId: number): void {
    const vertices = display.meshVertices;
    const uvs = display.meshUVs;
    const triangles = display.meshTriangles;
    if (!vertices || !uvs || !triangles) return;

    const matrix = display.meshInArmatureSpace
      ? composeRootMatrix(root)
      : (display.matrix ? composeMatrix(root, display.matrix) : null);
    if (!matrix) return;

    for (let i = 0; i < triangles.length; i += 3) {
      const i0 = triangles[i] * 2;
      const i1 = triangles[i + 1] * 2;
      const i2 = triangles[i + 2] * 2;
      const p0 = transformPoint(matrix, vertices[i0], vertices[i0 + 1]);
      const p1 = transformPoint(matrix, vertices[i1], vertices[i1 + 1]);
      const p2 = transformPoint(matrix, vertices[i2], vertices[i2 + 1]);

      drawTextureQuad(
        textureId,
        p0.x,
        p0.y,
        uvs[i0],
        uvs[i0 + 1],
        p1.x,
        p1.y,
        uvs[i1],
        uvs[i1 + 1],
        p2.x,
        p2.y,
        uvs[i2],
        uvs[i2 + 1],
        p2.x,
        p2.y,
        uvs[i2],
        uvs[i2 + 1],
        display.red,
        display.green,
        display.blue,
        root.node.opacity * display.alpha * 255,
      );
    }
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
    const dragonBonesData = this.parseDragonBonesData(skeleton, key, 1);
    if (!dragonBonesData) {
      throw new Error(`Failed to parse DragonBones skeleton: ${key}`);
    }

    this.parseTextureAtlasData(atlas, texture, key);
  }

  advanceTime(passedTime: number): void {
    (this as any)._dragonBones.advanceTime(passedTime);
  }
}

export class DragonBones extends ComponentX<DragonBonesProps> {
  private factory: SdlFactory | null = null;
  private armature: Armature | null = null;
  private loadedKey = '';
  private loadVersion = 0;
  private completedLoops = 0;
  private animationEnded = false;

  onStart(): void {
    this.reload().catch((error) => {
      console.error('DragonBones reload failed', error);
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
      this.factory.getDragonBonesData(loaded.key)?.armatureNames[0] ?? '',
      loaded.key,
      this.props.skin ?? '',
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
    this.armature.animation.play(animation ?? null, playTimes ?? 0);
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
    this.loadedKey = '';
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
    if (typeof fetch === 'function') {
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
  const rootMatrix = composeRootMatrix(root);

  return {
    a: rootMatrix.a * local.a + rootMatrix.c * local.b,
    b: rootMatrix.b * local.a + rootMatrix.d * local.b,
    c: rootMatrix.a * local.c + rootMatrix.c * local.d,
    d: rootMatrix.b * local.c + rootMatrix.d * local.d,
    tx: rootMatrix.tx + rootMatrix.a * local.tx + rootMatrix.c * local.ty,
    ty: rootMatrix.ty + rootMatrix.b * local.tx + rootMatrix.d * local.ty,
  } as Matrix;
}

function composeRootMatrix(root: DragonBones): Matrix {
  const node = root.node;
  const radians = node.worldRotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const na = cos * node.worldScaleX;
  const nb = sin * node.worldScaleX;
  const nc = -sin * node.worldScaleY;
  const nd = cos * node.worldScaleY;

  return { a: na, b: nb, c: nc, d: nd, tx: node.worldX, ty: node.worldY } as Matrix;
}

function transformPoint(matrix: Matrix, x: number, y: number): { x: number, y: number } {
  return {
    x: matrix.a * x + matrix.c * y + matrix.tx,
    y: matrix.b * x + matrix.d * y + matrix.ty,
  };
}
