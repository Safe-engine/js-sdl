import { loadTextFile } from 'sdl3'

export interface SpriteFrameRegion extends TextureRegion {
  rotated?: boolean
}

export interface SpriteFrameDefinition {
  texturePath: string
  region: SpriteFrameRegion | null
}

interface SpriteAtlasFrameJson {
  filename?: string
  name?: string
  rotated?: boolean
  frame?: {
    x?: number
    y?: number
    w?: number
    h?: number
    width?: number
    height?: number
  }
  frameString?: string
  x?: number
  y?: number
  w?: number
  h?: number
  width?: number
  height?: number
}

function parseFrameString(frame: string): SpriteFrameRegion | null {
  const match = frame.match(/\{\{(\d+),(\d+)\},\{(\d+),(\d+)\}\}/)
  if (!match) return null

  return {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  }
}

function withRotation(region: SpriteFrameRegion | null, frame: SpriteAtlasFrameJson): SpriteFrameRegion | null {
  if (!region) return null
  if (frame.rotated === true) return { ...region, rotated: true }
  return region
}

function toRegion(value: unknown): SpriteFrameRegion | null {
  if (!value || typeof value !== 'object') return null
  const frame = value as SpriteAtlasFrameJson
  if (typeof frame.frame === 'string') return withRotation(parseFrameString(frame.frame), frame)
  if (typeof frame.frameString === 'string') return withRotation(parseFrameString(frame.frameString), frame)
  const source = frame.frame && typeof frame.frame === 'object' ? frame.frame : frame
  const x = Number(source.x)
  const y = Number(source.y)
  const width = Number(source.w ?? source.width)
  const height = Number(source.h ?? source.height)
  if (![x, y, width, height].every(Number.isFinite)) return null
  return withRotation({ x, y, width, height }, frame)
}

export function parseSpriteAtlasFrames(data: unknown): Record<string, SpriteFrameRegion> {
  if (!data || typeof data !== 'object') return {}

  const atlas = data as { frames?: unknown }
  const source = atlas.frames ?? data
  if (!source || typeof source !== 'object') return {}

  const frames: Record<string, SpriteFrameRegion> = {}
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

  addFrame(key: string, texturePath: string, region: SpriteFrameRegion): this {
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
    } catch {
      throw new Error(`Failed to parse sprite atlas JSON: ${atlasPath}`)
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
