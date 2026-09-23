import type { TextureAsset, TextureAtlas } from '../AssetManager'

export interface BitmapFontChar {
  id: number
  char: string
  x: number
  y: number
  width: number
  height: number
  xoffset: number
  yoffset: number
  xadvance: number
  page?: number
}

export interface BitmapFontData {
  face: string
  size: number
  lineHeight: number
  base: number
  chars: Map<number, BitmapFontChar>
  kernings?: Map<number, number>
}

export interface BitmapFontAtlasOptions {
  face?: string
  size?: number
  lineHeight?: number
  base?: number
  chars?: Record<string, string>
  framePrefix?: string
  letterSpacing?: number
}

export class BitmapFont {
  private static registry = new Map<string, BitmapFont>()

  readonly data: BitmapFontData
  readonly texture: TextureAsset
  readonly atlas?: TextureAtlas

  constructor(data: BitmapFontData, texture: TextureAsset, atlas?: TextureAtlas) {
    this.data = data
    this.texture = texture
    this.atlas = atlas
  }

  static register(name: string, font: BitmapFont): void {
    this.registry.set(name, font)
  }

  static get(name: string): BitmapFont | null {
    return this.registry.get(name) ?? null
  }

  static unregister(name: string): void {
    this.registry.delete(name)
  }

  /**
   * Constructs a BitmapFont from a TextureAtlas where characters map to atlas frames.
   * This allows text rendering to share the exact same texture as sprites, batching in 1 draw call.
   */
  static fromAtlas(atlas: TextureAtlas, options: BitmapFontAtlasOptions = {}): BitmapFont {
    const chars = new Map<number, BitmapFontChar>()
    let maxCharHeight = 0

    if (options.chars) {
      for (const [char, frameName] of Object.entries(options.chars)) {
        const frame = atlas.getFrame(frameName)
        if (!frame) continue
        const code = char.codePointAt(0) ?? char.charCodeAt(0)
        maxCharHeight = Math.max(maxCharHeight, frame.height)
        chars.set(code, {
          id: code,
          char,
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          xoffset: 0,
          yoffset: 0,
          xadvance: frame.width + (options.letterSpacing ?? 0),
          page: 0,
        })
      }
    } else {
      const prefix = options.framePrefix ?? ''
      for (const [frameName, frame] of Object.entries(atlas.frames)) {
        let charStr = ''
        if (prefix && frameName.startsWith(prefix)) {
          charStr = frameName.slice(prefix.length)
        } else if (frameName.length === 1) {
          charStr = frameName
        } else if (frameName.startsWith('num_') && frameName.length === 5) {
          charStr = frameName.slice(4)
        } else if (frameName.startsWith('char_')) {
          const raw = frameName.slice(5)
          const num = parseInt(raw, 10)
          charStr = !Number.isNaN(num) ? String.fromCodePoint(num) : raw
        }

        if (charStr && charStr.length === 1) {
          const code = charStr.codePointAt(0) ?? charStr.charCodeAt(0)
          maxCharHeight = Math.max(maxCharHeight, frame.height)
          chars.set(code, {
            id: code,
            char: charStr,
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
            xoffset: 0,
            yoffset: 0,
            xadvance: frame.width + (options.letterSpacing ?? 0),
            page: 0,
          })
        }
      }
    }

    const size = options.size ?? (maxCharHeight || 32)
    const lineHeight = options.lineHeight ?? maxCharHeight ?? size
    const base = options.base ?? lineHeight

    const data: BitmapFontData = {
      face: options.face ?? 'AtlasBitmapFont',
      size,
      lineHeight,
      base,
      chars,
    }

    const font = new BitmapFont(data, atlas.texture, atlas)
    if (options.face) {
      this.register(options.face, font)
    }
    return font
  }

  /**
   * Parses standard BMFont formatted content (XML, Text, or JSON).
   */
  static parseFnt(content: string, texture: TextureAsset, atlas?: TextureAtlas): BitmapFont {
    const trimmed = content.trim()
    if (trimmed.startsWith('<')) {
      return this.parseXmlFnt(trimmed, texture, atlas)
    }
    if (trimmed.startsWith('{')) {
      return this.parseJsonFnt(trimmed, texture, atlas)
    }
    return this.parseTextFnt(trimmed, texture, atlas)
  }

  private static parseTextFnt(content: string, texture: TextureAsset, atlas?: TextureAtlas): BitmapFont {
    let face = 'BMFont'
    let size = 32
    let lineHeight = 32
    let base = 26
    const chars = new Map<number, BitmapFontChar>()
    const kernings = new Map<number, number>()

    const lines = content.split(/\r?\n/)
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      if (line.startsWith('info ')) {
        const faceMatch = line.match(/face="([^"]+)"/)
        if (faceMatch) face = faceMatch[1]
        const sizeMatch = line.match(/size=(-?\d+)/)
        if (sizeMatch) size = Math.abs(parseInt(sizeMatch[1], 10))
      } else if (line.startsWith('common ')) {
        const lhMatch = line.match(/lineHeight=(\d+)/)
        if (lhMatch) lineHeight = parseInt(lhMatch[1], 10)
        const baseMatch = line.match(/base=(\d+)/)
        if (baseMatch) base = parseInt(baseMatch[1], 10)
      } else if (line.startsWith('char ')) {
        const idMatch = line.match(/id=(\d+)/)
        const xMatch = line.match(/x=(\d+)/)
        const yMatch = line.match(/y=(\d+)/)
        const wMatch = line.match(/width=(\d+)/)
        const hMatch = line.match(/height=(\d+)/)
        const xoMatch = line.match(/xoffset=(-?\d+)/)
        const yoMatch = line.match(/yoffset=(-?\d+)/)
        const xaMatch = line.match(/xadvance=(-?\d+)/)
        const pageMatch = line.match(/page=(\d+)/)

        if (idMatch && xMatch && yMatch && wMatch && hMatch) {
          const id = parseInt(idMatch[1], 10)
          chars.set(id, {
            id,
            char: String.fromCodePoint(id),
            x: parseInt(xMatch[1], 10),
            y: parseInt(yMatch[1], 10),
            width: parseInt(wMatch[1], 10),
            height: parseInt(hMatch[1], 10),
            xoffset: xoMatch ? parseInt(xoMatch[1], 10) : 0,
            yoffset: yoMatch ? parseInt(yoMatch[1], 10) : 0,
            xadvance: xaMatch ? parseInt(xaMatch[1], 10) : parseInt(wMatch[1], 10),
            page: pageMatch ? parseInt(pageMatch[1], 10) : 0,
          })
        }
      } else if (line.startsWith('kerning ')) {
        const fMatch = line.match(/first=(\d+)/)
        const sMatch = line.match(/second=(\d+)/)
        const aMatch = line.match(/amount=(-?\d+)/)
        if (fMatch && sMatch && aMatch) {
          const first = parseInt(fMatch[1], 10)
          const second = parseInt(sMatch[1], 10)
          const amount = parseInt(aMatch[1], 10)
          kernings.set((first << 16) | second, amount)
        }
      }
    }

    const data: BitmapFontData = {
      face,
      size,
      lineHeight,
      base,
      chars,
      kernings,
    }
    const font = new BitmapFont(data, texture, atlas)
    this.register(face, font)
    return font
  }

  private static parseXmlFnt(xml: string, texture: TextureAsset, atlas?: TextureAtlas): BitmapFont {
    let face = 'BMFont'
    let size = 32
    let lineHeight = 32
    let base = 26
    const chars = new Map<number, BitmapFontChar>()
    const kernings = new Map<number, number>()

    const infoMatch = xml.match(/<info[^>]*>/)
    if (infoMatch) {
      const f = infoMatch[0].match(/face="([^"]+)"/)
      if (f) face = f[1]
      const s = infoMatch[0].match(/size="(-?\d+)"/)
      if (s) size = Math.abs(parseInt(s[1], 10))
    }

    const commonMatch = xml.match(/<common[^>]*>/)
    if (commonMatch) {
      const lh = commonMatch[0].match(/lineHeight="(\d+)"/)
      if (lh) lineHeight = parseInt(lh[1], 10)
      const b = commonMatch[0].match(/base="(\d+)"/)
      if (b) base = parseInt(b[1], 10)
    }

    const charRegex = /<char\s+([^>]+)\/>/g
    let charMatch: RegExpExecArray | null
    while ((charMatch = charRegex.exec(xml)) !== null) {
      const attrs = charMatch[1]
      const idM = attrs.match(/id="(\d+)"/)
      const xM = attrs.match(/x="(\d+)"/)
      const yM = attrs.match(/y="(\d+)"/)
      const wM = attrs.match(/width="(\d+)"/)
      const hM = attrs.match(/height="(\d+)"/)
      const xoM = attrs.match(/xoffset="(-?\d+)"/)
      const yoM = attrs.match(/yoffset="(-?\d+)"/)
      const xaM = attrs.match(/xadvance="(-?\d+)"/)
      const pageM = attrs.match(/page="(\d+)"/)

      if (idM && xM && yM && wM && hM) {
        const id = parseInt(idM[1], 10)
        chars.set(id, {
          id,
          char: String.fromCodePoint(id),
          x: parseInt(xM[1], 10),
          y: parseInt(yM[1], 10),
          width: parseInt(wM[1], 10),
          height: parseInt(hM[1], 10),
          xoffset: xoM ? parseInt(xoM[1], 10) : 0,
          yoffset: yoM ? parseInt(yoM[1], 10) : 0,
          xadvance: xaM ? parseInt(xaM[1], 10) : parseInt(wM[1], 10),
          page: pageM ? parseInt(pageM[1], 10) : 0,
        })
      }
    }

    const kerningRegex = /<kerning\s+([^>]+)\/>/g
    let kMatch: RegExpExecArray | null
    while ((kMatch = kerningRegex.exec(xml)) !== null) {
      const attrs = kMatch[1]
      const fM = attrs.match(/first="(\d+)"/)
      const sM = attrs.match(/second="(\d+)"/)
      const aM = attrs.match(/amount="(-?\d+)"/)
      if (fM && sM && aM) {
        const first = parseInt(fM[1], 10)
        const second = parseInt(sM[1], 10)
        const amount = parseInt(aM[1], 10)
        kernings.set((first << 16) | second, amount)
      }
    }

    const data: BitmapFontData = {
      face,
      size,
      lineHeight,
      base,
      chars,
      kernings,
    }
    const font = new BitmapFont(data, texture, atlas)
    this.register(face, font)
    return font
  }

  private static parseJsonFnt(jsonStr: string, texture: TextureAsset, atlas?: TextureAtlas): BitmapFont {
    const json = JSON.parse(jsonStr)
    const chars = new Map<number, BitmapFontChar>()
    const kernings = new Map<number, number>()

    const rawChars = json.chars ?? json.characters ?? []
    for (const c of rawChars) {
      const id = Number(c.id)
      chars.set(id, {
        id,
        char: c.char ?? String.fromCodePoint(id),
        x: Number(c.x),
        y: Number(c.y),
        width: Number(c.width),
        height: Number(c.height),
        xoffset: Number(c.xoffset ?? 0),
        yoffset: Number(c.yoffset ?? 0),
        xadvance: Number(c.xadvance ?? c.width),
        page: Number(c.page ?? 0),
      })
    }

    const rawKernings = json.kernings ?? []
    for (const k of rawKernings) {
      const first = Number(k.first)
      const second = Number(k.second)
      const amount = Number(k.amount)
      kernings.set((first << 16) | second, amount)
    }

    const data: BitmapFontData = {
      face: json.info?.face ?? json.face ?? 'BMFont',
      size: Number(json.info?.size ?? json.size ?? 32),
      lineHeight: Number(json.common?.lineHeight ?? json.lineHeight ?? 32),
      base: Number(json.common?.base ?? json.base ?? 26),
      chars,
      kernings,
    }
    const font = new BitmapFont(data, texture, atlas)
    this.register(data.face, font)
    return font
  }

  getChar(char: string | number): BitmapFontChar | null {
    const code = typeof char === 'number' ? char : (char.codePointAt(0) ?? char.charCodeAt(0))
    return this.data.chars.get(code) ?? null
  }

  getKerning(first: number, second: number): number {
    return this.data.kernings?.get((first << 16) | second) ?? 0
  }

  measureText(text: string, fontSize?: number, letterSpacing = 0): { width: number, height: number } {
    const scale = fontSize && this.data.size > 0 ? fontSize / this.data.size : 1
    const lines = text.split(/\r?\n/)
    let maxWidth = 0

    for (const line of lines) {
      let lineWidth = 0
      let prevCode = -1
      for (const char of line) {
        const code = char.codePointAt(0) ?? char.charCodeAt(0)
        const charData = this.getChar(code)
        if (!charData) continue

        const kerning = prevCode !== -1 ? this.getKerning(prevCode, code) : 0
        lineWidth += (charData.xadvance + kerning + letterSpacing) * scale
        prevCode = code
      }
      if (lineWidth > maxWidth) maxWidth = lineWidth
    }

    const totalHeight = lines.length * this.data.lineHeight * scale
    return {
      width: Math.ceil(maxWidth),
      height: Math.ceil(totalHeight),
    }
  }
}
