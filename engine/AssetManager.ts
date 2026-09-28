import * as sdl from 'sdl3'

// Avoid repeated QuickJS-to-C calls in native render loops. Web textures can
// acquire their dimensions asynchronously, so their getters must stay live.
const cacheTextureDimensions = sdl.isNative ?? false

interface TextureRecord {
  id: number
  width: number
  height: number
  refs: number
}

interface FontRecord {
  id: number
  refs: number
}

export class TextureAsset {
  private released = false
  private readonly cachedWidth: number
  private readonly cachedHeight: number

  constructor(
    readonly key: string,
    readonly id: number,
    width: number,
    height: number,
    private readonly releaseAsset: (key: string) => void,
  ) {
    this.cachedWidth = width
    this.cachedHeight = height
  }

  get width(): number {
    return cacheTextureDimensions
      ? this.cachedWidth
      : sdl.getTextureWidth(this.id) || this.cachedWidth
  }

  get height(): number {
    return cacheTextureDimensions
      ? this.cachedHeight
      : sdl.getTextureHeight(this.id) || this.cachedHeight
  }

  /** Resolve once the texture has loaded; reject if loading failed. */
  whenReady(): Promise<void> {
    // The native backend loads synchronously and does not export this hook.
    return sdl.whenTextureReady?.(this.id) ?? Promise.resolve()
  }

  release(): void {
    if (this.released) return
    this.released = true
    this.releaseAsset(this.key)
  }
}

export class FontAsset {
  private released = false

  constructor(
    readonly key: string,
    readonly id: number,
    readonly path: string,
    readonly size: number,
    private readonly releaseAsset: (key: string) => void,
  ) {}

  /** Resolve once the font has loaded; reject if loading failed. */
  whenReady(): Promise<void> {
    return sdl.whenFontReady?.(this.id) ?? Promise.resolve()
  }

  release(): void {
    if (this.released) return
    this.released = true
    this.releaseAsset(this.key)
  }
}

export class TextureAtlas {
  constructor(
    readonly texture: TextureAsset,
    readonly frames: Readonly<Record<string, TextureRegion>>,
  ) {}

  getFrame(name: string): TextureRegion | null {
    return this.frames[name] ?? null
  }

  whenReady(): Promise<void> {
    return this.texture.whenReady()
  }

  release(): void {
    this.texture.release()
  }
}

export class SpriteSheet extends TextureAtlas {
  static grid(
    texture: TextureAsset,
    frameWidth: number,
    frameHeight: number,
    options: {
      columns?: number
      rows?: number
      margin?: number
      spacing?: number
      names?: string[]
    } = {},
  ): SpriteSheet {
    const margin = options.margin ?? 0
    const spacing = options.spacing ?? 0
    const columns = options.columns
      ?? Math.floor((texture.width - margin * 2 + spacing) / (frameWidth + spacing))
    const rows = options.rows
      ?? Math.floor((texture.height - margin * 2 + spacing) / (frameHeight + spacing))
    const frames: Record<string, TextureRegion> = {}

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column
        const name = options.names?.[index] ?? String(index)
        frames[name] = {
          x: margin + column * (frameWidth + spacing),
          y: margin + row * (frameHeight + spacing),
          width: frameWidth,
          height: frameHeight,
        }
      }
    }

    return new SpriteSheet(texture, frames)
  }
}

export type PreloadRequest
  = | { type: 'texture', key: string, path: string }
    | { type: 'font', key: string, path: string, size: number }
    | {
      type: 'atlas'
      key: string
      path: string
      frames: Readonly<Record<string, TextureRegion>>
    }

export interface PreloadProgress {
  loaded: number
  total: number
  progress: number
  key: string
}

export class AssetGroup {
  private requests: PreloadRequest[] = []
  private assets = new Map<string, TextureAsset | FontAsset | TextureAtlas>()

  addTexture(key: string, path: string = key): this {
    this.requests.push({ type: 'texture', key, path })
    return this
  }

  addFont(key: string, path: string, size: number): this {
    this.requests.push({ type: 'font', key, path, size })
    return this
  }

  addAtlas(
    key: string,
    path: string,
    frames: Readonly<Record<string, TextureRegion>>,
  ): this {
    this.requests.push({ type: 'atlas', key, path, frames })
    return this
  }

  /**
   * Acquire every requested asset and resolve once all have finished loading.
   * Assets load in parallel; progress is reported as each one completes. If
   * any asset fails, everything acquired by this call is released.
   */
  async preload(onProgress?: (progress: PreloadProgress) => void): Promise<this> {
    this.unload()
    const total = this.requests.length

    try {
      const pending: Array<{ key: string, asset: TextureAsset | FontAsset | TextureAtlas }> = []
      for (const request of this.requests) {
        let asset: TextureAsset | FontAsset | TextureAtlas
        if (request.type === 'font') {
          asset = AssetManager.acquireFont(request.path, request.size)
        } else if (request.type === 'atlas') {
          asset = AssetManager.acquireAtlas(request.path, request.frames)
        } else {
          asset = AssetManager.acquireTexture(request.path)
        }
        this.assets.get(request.key)?.release()
        this.assets.set(request.key, asset)
        pending.push({ key: request.key, asset })
      }

      let loaded = 0
      let failed = false
      await Promise.all(pending.map(async ({ key, asset }) => {
        try {
          await asset.whenReady()
        } catch (error) {
          failed = true
          throw error
        }
        // Stay quiet about stragglers once the preload as a whole has failed.
        if (failed) return
        loaded++
        onProgress?.({ loaded, total, progress: loaded / total, key })
      }))
    } catch (error) {
      this.unload()
      throw error
    }

    if (total === 0) {
      onProgress?.({ loaded: 0, total: 0, progress: 1, key: '' })
    }
    return this
  }

  get<T extends TextureAsset | FontAsset | TextureAtlas>(key: string): T | null {
    return (this.assets.get(key) as T | undefined) ?? null
  }

  unload(): void {
    for (const asset of this.assets.values()) asset.release()
    this.assets.clear()
  }
}

export class AssetManager {
  private static textures = new Map<string, TextureRecord>()
  private static fonts = new Map<string, FontRecord>()
  private static textTextures = new Map<string, TextureRecord>()

  static acquireTexture(path: string, options?: { pma?: boolean }): TextureAsset {
    const pma = options?.pma ?? false
    const key = pma ? `${path}\0pma` : path
    return this.acquireTextureRecord(this.textures, key, () => sdl.loadTexture(path, pma))
  }

  static acquireFont(path: string, size: number): FontAsset {
    const key = `${path}\0${size}`
    let record = this.fonts.get(key)
    if (!record) {
      const id = sdl.loadFont(path, size)
      if (id < 0) throw new Error(`Failed to load font: ${path} (${size}px)`)
      record = { id, refs: 0 }
      this.fonts.set(key, record)
    }
    record.refs++
    return new FontAsset(key, record.id, path, size, (assetKey) => {
      const current = this.fonts.get(assetKey)
      if (!current || --current.refs > 0) return
      sdl.releaseFont(current.id)
      this.fonts.delete(assetKey)
    })
  }

  static acquireText(font: FontAsset, text: string): TextureAsset {
    const key = `${font.key}\0${text}`
    return this.acquireTextureRecord(
      this.textTextures,
      key,
      () => sdl.loadTextTexture(font.id, text),
    )
  }

  static acquireAtlas(
    path: string,
    frames: Readonly<Record<string, TextureRegion>>,
  ): TextureAtlas {
    return new TextureAtlas(this.acquireTexture(path), frames)
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
    )
  }

  static createGroup(): AssetGroup {
    return new AssetGroup()
  }

  private static acquireTextureRecord(
    cache: Map<string, TextureRecord>,
    key: string,
    loader: () => number,
  ): TextureAsset {
    let record = cache.get(key)
    if (!record) {
      const id = loader()
      if (id < 0) throw new Error(`Failed to load texture asset: ${key}`)
      record = {
        id,
        width: sdl.getTextureWidth(id),
        height: sdl.getTextureHeight(id),
        refs: 0,
      }
      cache.set(key, record)
    }
    record.refs++

    return new TextureAsset(
      key,
      record.id,
      record.width,
      record.height,
      (assetKey) => {
        const current = cache.get(assetKey)
        if (!current || --current.refs > 0) return
        sdl.releaseTexture(current.id)
        cache.delete(assetKey)
      },
    )
  }
}
