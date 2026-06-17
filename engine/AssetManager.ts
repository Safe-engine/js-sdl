import {
  getTextureHeight,
  getTextureWidth,
  loadFont,
  loadTextTexture,
  loadTexture,
  releaseFont,
  releaseTexture,
} from "sdl3";

export interface TextureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextureRecord {
  id: number;
  width: number;
  height: number;
  refs: number;
}

interface FontRecord {
  id: number;
  refs: number;
}

export class TextureAsset {
  private released = false;
  private readonly fallbackWidth: number;
  private readonly fallbackHeight: number;

  constructor(
    readonly key: string,
    readonly id: number,
    width: number,
    height: number,
    private readonly releaseAsset: (key: string) => void,
  ) {
    this.fallbackWidth = width;
    this.fallbackHeight = height;
  }

  get width(): number {
    return getTextureWidth(this.id) || this.fallbackWidth;
  }

  get height(): number {
    return getTextureHeight(this.id) || this.fallbackHeight;
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.releaseAsset(this.key);
  }
}

export class FontAsset {
  private released = false;

  constructor(
    readonly key: string,
    readonly id: number,
    readonly path: string,
    readonly size: number,
    private readonly releaseAsset: (key: string) => void,
  ) {}

  release(): void {
    if (this.released) return;
    this.released = true;
    this.releaseAsset(this.key);
  }
}

export class TextureAtlas {
  constructor(
    readonly texture: TextureAsset,
    readonly frames: Readonly<Record<string, TextureRegion>>,
  ) {}

  getFrame(name: string): TextureRegion | null {
    return this.frames[name] ?? null;
  }

  release(): void {
    this.texture.release();
  }
}

export class SpriteSheet extends TextureAtlas {
  static grid(
    texture: TextureAsset,
    frameWidth: number,
    frameHeight: number,
    options: {
      columns?: number;
      rows?: number;
      margin?: number;
      spacing?: number;
      names?: string[];
    } = {},
  ): SpriteSheet {
    const margin = options.margin ?? 0;
    const spacing = options.spacing ?? 0;
    const columns = options.columns ??
      Math.floor((texture.width - margin * 2 + spacing) / (frameWidth + spacing));
    const rows = options.rows ??
      Math.floor((texture.height - margin * 2 + spacing) / (frameHeight + spacing));
    const frames: Record<string, TextureRegion> = {};

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const name = options.names?.[index] ?? String(index);
        frames[name] = {
          x: margin + column * (frameWidth + spacing),
          y: margin + row * (frameHeight + spacing),
          width: frameWidth,
          height: frameHeight,
        };
      }
    }

    return new SpriteSheet(texture, frames);
  }
}

export type PreloadRequest =
  | { type: "texture"; key: string; path: string }
  | { type: "font"; key: string; path: string; size: number }
  | {
      type: "atlas";
      key: string;
      path: string;
      frames: Readonly<Record<string, TextureRegion>>;
    };

export interface PreloadProgress {
  loaded: number;
  total: number;
  progress: number;
  key: string;
}

export class AssetGroup {
  private requests: PreloadRequest[] = [];
  private assets = new Map<string, TextureAsset | FontAsset | TextureAtlas>();

  addTexture(key: string, path: string = key): this {
    this.requests.push({ type: "texture", key, path });
    return this;
  }

  addFont(key: string, path: string, size: number): this {
    this.requests.push({ type: "font", key, path, size });
    return this;
  }

  addAtlas(
    key: string,
    path: string,
    frames: Readonly<Record<string, TextureRegion>>,
  ): this {
    this.requests.push({ type: "atlas", key, path, frames });
    return this;
  }

  async preload(onProgress?: (progress: PreloadProgress) => void): Promise<this> {
    this.unload();
    const total = this.requests.length;

    try {
      for (let i = 0; i < total; i++) {
        await Promise.resolve();
        const request = this.requests[i];
        let asset: TextureAsset | FontAsset | TextureAtlas;
        if (request.type === "font") {
          asset = AssetManager.acquireFont(request.path, request.size);
        } else if (request.type === "atlas") {
          asset = AssetManager.acquireAtlas(request.path, request.frames);
        } else {
          asset = AssetManager.acquireTexture(request.path);
        }
        this.assets.get(request.key)?.release();
        this.assets.set(request.key, asset);
        onProgress?.({
          loaded: i + 1,
          total,
          progress: total === 0 ? 1 : (i + 1) / total,
          key: request.key,
        });
      }
    } catch (error) {
      this.unload();
      throw error;
    }

    if (total === 0) {
      onProgress?.({ loaded: 0, total: 0, progress: 1, key: "" });
    }
    return this;
  }

  get<T extends TextureAsset | FontAsset | TextureAtlas>(key: string): T | null {
    return (this.assets.get(key) as T | undefined) ?? null;
  }

  unload(): void {
    for (const asset of this.assets.values()) asset.release();
    this.assets.clear();
  }
}

export class AssetManager {
  private static textures = new Map<string, TextureRecord>();
  private static fonts = new Map<string, FontRecord>();
  private static textTextures = new Map<string, TextureRecord>();

  static acquireTexture(path: string): TextureAsset {
    return this.acquireTextureRecord(this.textures, path, () => loadTexture(path));
  }

  static acquireFont(path: string, size: number): FontAsset {
    const key = `${path}\0${size}`;
    let record = this.fonts.get(key);
    if (!record) {
      const id = loadFont(path, size);
      if (id < 0) throw new Error(`Failed to load font: ${path} (${size}px)`);
      record = { id, refs: 0 };
      this.fonts.set(key, record);
    }
    record.refs++;
    return new FontAsset(key, record.id, path, size, (assetKey) => {
      const current = this.fonts.get(assetKey);
      if (!current || --current.refs > 0) return;
      releaseFont(current.id);
      this.fonts.delete(assetKey);
    });
  }

  static acquireText(font: FontAsset, text: string): TextureAsset {
    const key = `${font.key}\0${text}`;
    return this.acquireTextureRecord(
      this.textTextures,
      key,
      () => loadTextTexture(font.id, text),
    );
  }

  static acquireAtlas(
    path: string,
    frames: Readonly<Record<string, TextureRegion>>,
  ): TextureAtlas {
    return new TextureAtlas(this.acquireTexture(path), frames);
  }

  static acquireSpriteSheet(
    path: string,
    frameWidth: number,
    frameHeight: number,
    options?: Parameters<typeof SpriteSheet.grid>[3],
  ): SpriteSheet {
    return SpriteSheet.grid(
      this.acquireTexture(path),
      frameWidth,
      frameHeight,
      options,
    );
  }

  static createGroup(): AssetGroup {
    return new AssetGroup();
  }

  private static acquireTextureRecord(
    cache: Map<string, TextureRecord>,
    key: string,
    loader: () => number,
  ): TextureAsset {
    let record = cache.get(key);
    if (!record) {
      const id = loader();
      if (id < 0) throw new Error(`Failed to load texture asset: ${key}`);
      record = {
        id,
        width: getTextureWidth(id),
        height: getTextureHeight(id),
        refs: 0,
      };
      cache.set(key, record);
    }
    record.refs++;

    return new TextureAsset(
      key,
      record.id,
      record.width,
      record.height,
      (assetKey) => {
        const current = cache.get(assetKey);
        if (!current || --current.refs > 0) return;
        releaseTexture(current.id);
        cache.delete(assetKey);
      },
    );
  }
}
