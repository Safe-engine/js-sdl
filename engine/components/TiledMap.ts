import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import { AssetManager, TextureAsset } from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '../core/Node'
import { getLoadedTextAsset, loadTextAsset } from '../helper/text-resource'

export interface TiledMapProps {
  mapFile: string
}

interface TiledMapData {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  orientation?: string
  staggeraxis?: 'x' | 'y'
  staggerindex?: 'odd' | 'even'
  layers: TiledLayer[]
  tilesets: TiledTileset[]
}

interface TiledLayer {
  data?: number[]
  height: number
  name: string
  opacity?: number
  type: string
  visible?: boolean
  width: number
  x?: number
  y?: number
}

interface TiledTileset {
  columns: number
  firstgid: number
  image: string
  imageheight: number
  imagewidth: number
  margin?: number
  spacing?: number
  tileoffset?: {
    x?: number
    y?: number
  }
  tilecount: number
  tileheight: number
  tilewidth: number
}

interface LoadedTileset {
  data: TiledTileset
  firstgid: number
  lastgid: number
  imagePath: string
  texture: TextureAsset
}

interface TilePlacement {
  source: TextureRegion
  texture: TextureAsset
  x: number
  y: number
  opacity: number
  flipX: boolean
  flipY: boolean
}

interface TileBatch {
  texture: TextureAsset
  opacity: number
  positions: Float32Array
  uvs: Float32Array
  flippedUvs: Float32Array
  indices: Uint16Array
}

export class TiledMapLayer {
  constructor(
    private readonly node: { anchorX: number, anchorY: number },
    private readonly map: TiledMapData,
    private readonly layer: TiledLayer,
  ) {}

  getPositionAt(column: number, row: number): Point {
    const position = getTilePositionFor(
      this.map,
      column + (this.layer.x ?? 0),
      row + (this.layer.y ?? 0),
    )
    return {
      x: position.x - this.node.anchorX * getMapPixelWidthFor(this.map),
      y: position.y - this.node.anchorY * getMapPixelHeightFor(this.map),
    }
  }

  getTileAt(column: number, row: number): number | null {
    if (!this.layer.data) return null
    if (column < 0 || row < 0 || column >= this.layer.width || row >= this.layer.height) {
      return null
    }
    const rawGid = this.layer.data[row * this.layer.width + column]
    if (!rawGid) return null
    return rawGid & GID_MASK
  }
}

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000
const FLIPPED_VERTICALLY_FLAG = 0x40000000
const FLIPPED_DIAGONALLY_FLAG = 0x20000000
const GID_MASK = ~(FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG)

const mapCache = new Map<string, Promise<TiledMapData>>()

function buildTileBatches(tiles: TilePlacement[]): TileBatch[] {
  const batches: TileBatch[] = []
  let start = 0
  while (start < tiles.length) {
    const first = tiles[start]
    let end = start + 1
    while (end < tiles.length && tiles[end].texture === first.texture
      && tiles[end].opacity === first.opacity && end - start < 0x3fff) {
      end++
    }

    const count = end - start
    const positions = new Float32Array(count * 8)
    const uvs = new Float32Array(count * 8)
    const indices = new Uint16Array(count * 6)
    for (let i = 0; i < count; i++) {
      const tile = tiles[start + i]
      const position = i * 8
      const index = i * 6
      const { x, y, width, height } = tile.source
      positions.set([
        tile.x, tile.y,
        tile.x + width, tile.y,
        tile.x, tile.y + height,
        tile.x + width, tile.y + height,
      ], position)
      let u0 = x / tile.texture.width
      let v0 = y / tile.texture.height
      let u1 = (x + width) / tile.texture.width
      let v1 = (y + height) / tile.texture.height
      if (tile.flipX) [u0, u1] = [u1, u0]
      if (tile.flipY) [v0, v1] = [v1, v0]
      uvs.set([u0, v0, u1, v0, u0, v1, u1, v1], position)
      const vertex = i * 4
      indices.set([vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3], index)
    }
    batches.push({
      texture: first.texture,
      opacity: first.opacity,
      positions,
      uvs,
      flippedUvs: new Float32Array(uvs.length),
      indices,
    })
    start = end
  }
  return batches
}

function flipTileUvs(
  source: Float32Array,
  target: Float32Array,
  flipX: boolean,
  flipY: boolean,
): Float32Array {
  for (let i = 0; i < source.length; i += 8) {
    target[i] = source[i + (flipX ? 2 : 0)]
    target[i + 1] = source[i + (flipY ? 4 : 0) + 1]
    target[i + 2] = source[i + (flipX ? 0 : 2)]
    target[i + 3] = source[i + (flipY ? 4 : 0) + 3]
    target[i + 4] = source[i + (flipX ? 6 : 4)]
    target[i + 5] = source[i + (flipY ? 0 : 4) + 1]
    target[i + 6] = source[i + (flipX ? 4 : 6)]
    target[i + 7] = source[i + (flipY ? 0 : 4) + 3]
  }
  return target
}

export class TiledMap extends ComponentX<TiledMapProps> {
  private loadedMapFile = ''
  private map: TiledMapData | null = null
  private tilesets: LoadedTileset[] = []
  private tiles: TilePlacement[] = []
  private tileBatches: TileBatch[] = []
  private loadVersion = 0
  private loadingMapFile = ''
  private loadingPromise: Promise<void> | null = null

  onAwake(): void {
    const mapFile = this.props.mapFile
    if (!mapFile) return

    const text = getLoadedTextAsset(mapFile)
    if (text !== null) {
      this.applyMap(mapFile, JSON.parse(text) as TiledMapData)
    }
  }

  onStart(): void {
    void this.reload().catch((error) => {
      console.error('TiledMap reload failed', error)
    })
  }

  onRender(): void {
    if (!this.node?.visible || !this.map) return

    const mapWidth = this.getMapPixelWidth()
    const mapHeight = this.getMapPixelHeight()
    const originX = -this.node.anchorX * mapWidth
    const originY = -this.node.anchorY * mapHeight
    const radians = this.node.worldRotation * Math.PI / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const scaleX = this.node.worldScaleX
    const scaleY = this.node.worldScaleY
    const worldX = this.node.worldX
    const worldY = this.node.worldY
    const red = this.node.color.r
    const green = this.node.color.g
    const blue = this.node.color.b
    const alpha = this.node.opacity * (this.node.color.a ?? 255)
    const translateX = worldX + originX * scaleX * cos - originY * scaleY * sin
    const translateY = worldY + originX * scaleX * sin + originY * scaleY * cos

    for (const batch of this.tileBatches) {
      const uvs = this.node.flipX || this.node.flipY
        ? flipTileUvs(batch.uvs, batch.flippedUvs, this.node.flipX, this.node.flipY)
        : batch.uvs
      globalCommandBuffer.pushMesh(
        batch.texture.id,
        batch.positions,
        uvs,
        batch.indices,
        red,
        green,
        blue,
        alpha * batch.opacity,
        translateX,
        translateY,
        scaleX,
        scaleY,
        cos,
        sin,
      )
    }
  }

  onDestroy(): void {
    this.releaseTilesets()
    this.loadVersion++
  }

  async reload(): Promise<void> {
    const mapFile = this.props.mapFile
    if (!mapFile || mapFile === this.loadedMapFile) return
    if (this.loadingPromise && mapFile === this.loadingMapFile) {
      return this.loadingPromise
    }

    const version = ++this.loadVersion
    const loadingPromise = this.loadMap(mapFile, version)
    this.loadingMapFile = mapFile
    this.loadingPromise = loadingPromise
    try {
      await loadingPromise
    } finally {
      if (this.loadingPromise === loadingPromise) {
        this.loadingMapFile = ''
        this.loadingPromise = null
      }
    }
  }

  private async loadMap(mapFile: string, version: number): Promise<void> {
    const map = await loadMap(mapFile)
    if (version !== this.loadVersion) return

    this.applyMap(mapFile, map)
  }

  private applyMap(mapFile: string, map: TiledMapData): void {
    this.releaseTilesets()
    this.loadedMapFile = mapFile
    this.map = map
    this.tilesets = map.tilesets
      .map((tileset) => {
        const imagePath = resolveSiblingPath(mapFile, tileset.image)
        return {
          data: tileset,
          firstgid: tileset.firstgid,
          lastgid: tileset.firstgid + tileset.tilecount - 1,
          imagePath,
          texture: AssetManager.acquireTexture(imagePath),
        }
      })
      .sort((a, b) => a.firstgid - b.firstgid)
    this.tiles = this.buildTiles()
    this.tileBatches = buildTileBatches(this.tiles)
    this.fitDefaultNodeSize()
  }

  getLayer(name: string): TiledMapLayer {
    const { map, layer } = this.requireLayer(name)
    return new TiledMapLayer(this.node, map, layer)
  }

  private buildTiles(): TilePlacement[] {
    if (!this.map) return []

    const tiles: TilePlacement[] = []
    for (const layer of this.map.layers) {
      if (layer.type !== 'tilelayer' || layer.visible === false || !layer.data) continue

      const opacity = layer.opacity ?? 1
      for (let index = 0; index < layer.data.length; index++) {
        const rawGid = layer.data[index]
        const gid = rawGid & GID_MASK
        if (gid === 0) continue

        const tileset = this.getTileset(gid)
        if (!tileset) continue

        const column = index % layer.width
        const row = Math.floor(index / layer.width)
        const source = this.getTileSource(tileset.data, gid - tileset.firstgid)
        const position = this.getTilePosition(column + (layer.x ?? 0), row + (layer.y ?? 0))
        const offset = tileset.data.tileoffset

        tiles.push({
          source,
          texture: tileset.texture,
          x: position.x + (offset?.x ?? 0),
          y: position.y + this.map.tileheight - source.height + (offset?.y ?? 0),
          opacity,
          flipX: Boolean(rawGid & FLIPPED_HORIZONTALLY_FLAG),
          flipY: Boolean(rawGid & FLIPPED_VERTICALLY_FLAG),
        })
      }
    }
    return tiles
  }

  private getTileSource(tileset: TiledTileset, localId: number): TextureRegion {
    const margin = tileset.margin ?? 0
    const spacing = tileset.spacing ?? 0
    const column = localId % tileset.columns
    const row = Math.floor(localId / tileset.columns)
    return {
      x: margin + column * (tileset.tilewidth + spacing),
      y: margin + row * (tileset.tileheight + spacing),
      width: tileset.tilewidth,
      height: tileset.tileheight,
    }
  }

  private getTilePosition(column: number, row: number): { x: number, y: number } {
    return getTilePositionFor(this.map!, column, row)
  }

  private getTileset(gid: number): LoadedTileset | null {
    for (let i = this.tilesets.length - 1; i >= 0; i--) {
      const tileset = this.tilesets[i]
      if (gid >= tileset.firstgid && gid <= tileset.lastgid) return tileset
    }
    return null
  }

  private getMapPixelWidth(): number {
    if (!this.map) return this.node.width
    return getMapPixelWidthFor(this.map)
  }

  private getMapPixelHeight(): number {
    if (!this.map) return this.node.height
    return getMapPixelHeightFor(this.map)
  }

  private fitDefaultNodeSize(): void {
    if (!this.map) return
    if (this.node.width === DEFAULT_NODE_WIDTH) this.node.width = this.getMapPixelWidth()
    if (this.node.height === DEFAULT_NODE_HEIGHT) this.node.height = this.getMapPixelHeight()
  }

  private releaseTilesets(): void {
    for (const tileset of this.tilesets) tileset.texture.release()
    this.tilesets = []
    this.tiles = []
    this.tileBatches = []
    this.map = null
    this.loadedMapFile = ''
  }

  private requireLayer(name: string): { map: TiledMapData, layer: TiledLayer } {
    if (!this.map) {
      throw new Error(`TiledMap layer "${name}" is not available before the map has loaded`)
    }
    const layer = this.map.layers.find(candidate => candidate.name === name)
    if (!layer) {
      throw new Error(`TiledMap layer "${name}" was not found`)
    }
    return { map: this.map, layer }
  }
}

function isStaggeredIndex(value: number, staggerindex: 'odd' | 'even' = 'odd'): boolean {
  return staggerindex === 'odd' ? value % 2 === 1 : value % 2 === 0
}

function getTilePositionFor(
  map: TiledMapData,
  column: number,
  row: number,
): { x: number, y: number } {
  if (map.orientation === 'staggered' && map.staggeraxis === 'y') {
    const staggered = isStaggeredIndex(row, map.staggerindex)
    return {
      x: column * map.tilewidth + (staggered ? map.tilewidth / 2 : 0),
      y: row * map.tileheight / 2,
    }
  }

  if (map.orientation === 'staggered' && map.staggeraxis === 'x') {
    const staggered = isStaggeredIndex(column, map.staggerindex)
    return {
      x: column * map.tilewidth / 2,
      y: row * map.tileheight + (staggered ? map.tileheight / 2 : 0),
    }
  }

  return {
    x: column * map.tilewidth,
    y: row * map.tileheight,
  }
}

function getMapPixelWidthFor(map: TiledMapData): number {
  const widestTile = Math.max(
    map.tilewidth,
    ...map.tilesets.map(tileset => tileset.tilewidth),
  )
  const overhang = Math.max(0, widestTile - map.tilewidth)
  if (map.orientation === 'staggered' && map.staggeraxis === 'x') {
    return (map.width + 1) * map.tilewidth / 2 + overhang
  }
  const staggerOffset = map.orientation === 'staggered' && map.staggeraxis === 'y'
    ? map.tilewidth / 2
    : 0
  return map.width * map.tilewidth + staggerOffset + overhang
}

function getMapPixelHeightFor(map: TiledMapData): number {
  const tallestTile = Math.max(
    map.tileheight,
    ...map.tilesets.map(tileset => tileset.tileheight),
  )
  const overhang = Math.max(0, tallestTile - map.tileheight)
  if (map.orientation === 'staggered' && map.staggeraxis === 'y') {
    return (map.height + 1) * map.tileheight / 2 + overhang
  }
  const staggerOffset = map.orientation === 'staggered' && map.staggeraxis === 'x'
    ? map.tileheight / 2
    : 0
  return map.height * map.tileheight + staggerOffset + overhang
}

async function loadMap(path: string): Promise<TiledMapData> {
  let promise = mapCache.get(path)
  if (!promise) {
    promise = loadTextAsset(path, 'Tiled map').then(text => JSON.parse(text) as TiledMapData)
    mapCache.set(path, promise)
  }
  return promise
}

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling
}
