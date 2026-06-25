import { loadTextFile } from 'sdl3'

export interface SpriteFrameDefinition {
  texturePath: string
  region: TextureRegion | null
}

interface SpriteAtlasFrameJson {
  filename?: string
  name?: string
  frame?: {
    x?: number
    y?: number
    w?: number
    h?: number
    width?: number
    height?: number
  }
  x?: number
  y?: number
  w?: number
  h?: number
  width?: number
  height?: number
}

function toRegion(value: unknown): TextureRegion | null {
  if (!value || typeof value !== 'object') return null
  const frame = value as SpriteAtlasFrameJson
  const source = frame.frame && typeof frame.frame === 'object' ? frame.frame : frame
  const x = Number(source.x)
  const y = Number(source.y)
  const width = Number(source.w ?? source.width)
  const height = Number(source.h ?? source.height)
  if (![x, y, width, height].every(Number.isFinite)) return null
  return { x, y, width, height }
}

export function parseSpriteAtlasFrames(data: unknown): Record<string, TextureRegion> {
  if (!data || typeof data !== 'object') return {}

  const atlas = data as { frames?: unknown }
  const source = atlas.frames ?? data
  if (!source || typeof source !== 'object') return {}

  const frames: Record<string, TextureRegion> = {}
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== 'object') continue
      const name = (entry as SpriteAtlasFrameJson).filename ?? (entry as SpriteAtlasFrameJson).name
      const region = toRegion(entry)
      if (typeof name === 'string' && region) frames[name] = region
    }
    return frames
  }

  for (const [name, value] of Object.entries(source)) {
    const region = toRegion(value)
    if (region) frames[name] = region
  }
  return frames
}

async function loadAtlasText(path: string): Promise<string> {
  if (typeof fetch === 'function') {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`Failed to load sprite atlas: ${path}`)
    return response.text()
  }

  const text = loadTextFile(path)
  if (text === null) throw new Error(`Failed to load sprite atlas: ${path}`)
  return text
}

export class SpriteFrameCache {
  private frames = new Map<string, SpriteFrameDefinition>()

  addTexture(key: string, texturePath: string = key): this {
    this.frames.set(key, { texturePath, region: null })
    return this
  }

  addFrame(key: string, texturePath: string, region: TextureRegion): this {
    this.frames.set(key, { texturePath, region })
    return this
  }

  addAtlas(
    texturePath: string,
    atlas: unknown,
    options: { prefix?: string } = {},
  ): this {
    const prefix = options.prefix ?? ''
    for (const [name, region] of Object.entries(parseSpriteAtlasFrames(atlas))) {
      this.addFrame(`${prefix}${name}`, texturePath, region)
    }
    return this
  }

  async loadAtlas(
    texturePath: string,
    atlasPath: string,
    options: { prefix?: string } = {},
  ): Promise<this> {
    const text = await loadAtlasText(atlasPath)
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error(`Failed to parse sprite atlas JSON: ${atlasPath}`, {
        cause: error,
      })
    }
    return this.addAtlas(texturePath, data, options)
  }

  get(key: string): SpriteFrameDefinition | null {
    return this.frames.get(key) ?? null
  }

  clear(): void {
    this.frames.clear()
  }
}

export const spriteFrameCache = new SpriteFrameCache()
