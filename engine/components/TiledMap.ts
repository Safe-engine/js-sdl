import {
  drawTextureRegionRotated,
  loadTextFile,
} from "sdl3";
import { AssetManager, TextureAsset } from "../AssetManager";
import { ComponentX } from "../core/ComponentX";

export interface TiledMapProps {
  mapFile: string
}

interface TiledMapData {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation?: string;
  staggeraxis?: "x" | "y";
  staggerindex?: "odd" | "even";
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

interface TiledLayer {
  data?: number[];
  height: number;
  name: string;
  opacity?: number;
  type: string;
  visible?: boolean;
  width: number;
  x?: number;
  y?: number;
}

interface TiledTileset {
  columns: number;
  firstgid: number;
  image: string;
  imageheight: number;
  imagewidth: number;
  margin?: number;
  spacing?: number;
  tileoffset?: {
    x?: number;
    y?: number;
  };
  tilecount: number;
  tileheight: number;
  tilewidth: number;
}

interface LoadedTileset {
  data: TiledTileset;
  firstgid: number;
  lastgid: number;
  imagePath: string;
  texture: TextureAsset;
}

interface TilePlacement {
  source: TextureRegion;
  texture: TextureAsset;
  x: number;
  y: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
}

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const GID_MASK = ~(FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG);
const DEFAULT_NODE_SIZE = 64;

const mapCache = new Map<string, Promise<TiledMapData>>();

export class TiledMap extends ComponentX<TiledMapProps> {
  private loadedMapFile = "";
  private map: TiledMapData | null = null;
  private tilesets: LoadedTileset[] = [];
  private tiles: TilePlacement[] = [];
  private loadVersion = 0;

  onStart(): void {
    void this.reload().catch((error) => {
      console.error("TiledMap reload failed", error);
    });
  }

  onRender(): void {
    if (!this.node?.visible || !this.map) return;

    const mapWidth = this.getMapPixelWidth();
    const mapHeight = this.getMapPixelHeight();
    const originX = -this.node.anchorX * mapWidth;
    const originY = -this.node.anchorY * mapHeight;
    const radians = this.node.worldRotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const scaleX = this.node.worldScaleX;
    const scaleY = this.node.worldScaleY;
    const red = this.node.color.r;
    const green = this.node.color.g;
    const blue = this.node.color.b;
    const alpha = this.node.opacity * (this.node.color.a ?? 255);

    for (const tile of this.tiles) {
      const localX = (originX + tile.x) * scaleX;
      const localY = (originY + tile.y) * scaleY;
      const x = this.node.worldX + localX * cos - localY * sin;
      const y = this.node.worldY + localX * sin + localY * cos;

      drawTextureRegionRotated(
        tile.texture.id,
        tile.source.x,
        tile.source.y,
        tile.source.width,
        tile.source.height,
        x,
        y,
        tile.source.width * scaleX,
        tile.source.height * scaleY,
        this.node.worldRotation,
        0,
        0,
        this.node.flipX !== tile.flipX,
        this.node.flipY !== tile.flipY,
        red,
        green,
        blue,
        alpha * tile.opacity,
      );
    }
  }

  onDestroy(): void {
    this.releaseTilesets();
    this.loadVersion++;
  }

  async reload(): Promise<void> {
    const mapFile = this.props.mapFile;
    if (!mapFile || mapFile === this.loadedMapFile) return;

    const version = ++this.loadVersion;
    const map = await loadMap(mapFile);
    if (version !== this.loadVersion) return;

    this.releaseTilesets();
    this.loadedMapFile = mapFile;
    this.map = map;
    this.tilesets = map.tilesets
      .map((tileset) => {
        const imagePath = resolveSiblingPath(mapFile, tileset.image);
        return {
          data: tileset,
          firstgid: tileset.firstgid,
          lastgid: tileset.firstgid + tileset.tilecount - 1,
          imagePath,
          texture: AssetManager.acquireTexture(imagePath),
        };
      })
      .sort((a, b) => a.firstgid - b.firstgid);
    this.tiles = this.buildTiles();
    this.fitDefaultNodeSize();
  }

  private buildTiles(): TilePlacement[] {
    if (!this.map) return [];

    const tiles: TilePlacement[] = [];
    for (const layer of this.map.layers) {
      if (layer.type !== "tilelayer" || layer.visible === false || !layer.data) continue;

      const opacity = layer.opacity ?? 1;
      for (let index = 0; index < layer.data.length; index++) {
        const rawGid = layer.data[index];
        const gid = rawGid & GID_MASK;
        if (gid === 0) continue;

        const tileset = this.getTileset(gid);
        if (!tileset) continue;

        const column = index % layer.width;
        const row = Math.floor(index / layer.width);
        const source = this.getTileSource(tileset.data, gid - tileset.firstgid);
        const position = this.getTilePosition(column + (layer.x ?? 0), row + (layer.y ?? 0));
        const offset = tileset.data.tileoffset;

        tiles.push({
          source,
          texture: tileset.texture,
          x: position.x + (offset?.x ?? 0),
          y: position.y + this.map.tileheight - source.height + (offset?.y ?? 0),
          opacity,
          flipX: Boolean(rawGid & FLIPPED_HORIZONTALLY_FLAG),
          flipY: Boolean(rawGid & FLIPPED_VERTICALLY_FLAG),
        });
      }
    }
    return tiles;
  }

  private getTileSource(tileset: TiledTileset, localId: number): TextureRegion {
    const margin = tileset.margin ?? 0;
    const spacing = tileset.spacing ?? 0;
    const column = localId % tileset.columns;
    const row = Math.floor(localId / tileset.columns);
    return {
      x: margin + column * (tileset.tilewidth + spacing),
      y: margin + row * (tileset.tileheight + spacing),
      width: tileset.tilewidth,
      height: tileset.tileheight,
    };
  }

  private getTilePosition(column: number, row: number): { x: number; y: number } {
    const map = this.map!;

    if (map.orientation === "staggered" && map.staggeraxis === "y") {
      const staggered = isStaggeredIndex(row, map.staggerindex);
      return {
        x: column * map.tilewidth + (staggered ? map.tilewidth / 2 : 0),
        y: row * map.tileheight / 2,
      };
    }

    if (map.orientation === "staggered" && map.staggeraxis === "x") {
      const staggered = isStaggeredIndex(column, map.staggerindex);
      return {
        x: column * map.tilewidth / 2,
        y: row * map.tileheight + (staggered ? map.tileheight / 2 : 0),
      };
    }

    return {
      x: column * map.tilewidth,
      y: row * map.tileheight,
    };
  }

  private getTileset(gid: number): LoadedTileset | null {
    for (let i = this.tilesets.length - 1; i >= 0; i--) {
      const tileset = this.tilesets[i];
      if (gid >= tileset.firstgid && gid <= tileset.lastgid) return tileset;
    }
    return null;
  }

  private getMapPixelWidth(): number {
    if (!this.map) return this.node.width;
    const widestTile = Math.max(
      this.map.tilewidth,
      ...this.map.tilesets.map((tileset) => tileset.tilewidth),
    );
    const overhang = Math.max(0, widestTile - this.map.tilewidth);
    if (this.map.orientation === "staggered" && this.map.staggeraxis === "x") {
      return (this.map.width + 1) * this.map.tilewidth / 2 + overhang;
    }
    const staggerOffset = this.map.orientation === "staggered" && this.map.staggeraxis === "y"
      ? this.map.tilewidth / 2
      : 0;
    return this.map.width * this.map.tilewidth + staggerOffset + overhang;
  }

  private getMapPixelHeight(): number {
    if (!this.map) return this.node.height;
    const tallestTile = Math.max(
      this.map.tileheight,
      ...this.map.tilesets.map((tileset) => tileset.tileheight),
    );
    const overhang = Math.max(0, tallestTile - this.map.tileheight);
    if (this.map.orientation === "staggered" && this.map.staggeraxis === "y") {
      return (this.map.height + 1) * this.map.tileheight / 2 + overhang;
    }
    const staggerOffset = this.map.orientation === "staggered" && this.map.staggeraxis === "x"
      ? this.map.tileheight / 2
      : 0;
    return this.map.height * this.map.tileheight + staggerOffset + overhang;
  }

  private fitDefaultNodeSize(): void {
    if (!this.map) return;
    if (this.node.width === DEFAULT_NODE_SIZE) this.node.width = this.getMapPixelWidth();
    if (this.node.height === DEFAULT_NODE_SIZE) this.node.height = this.getMapPixelHeight();
  }

  private releaseTilesets(): void {
    for (const tileset of this.tilesets) tileset.texture.release();
    this.tilesets = [];
    this.tiles = [];
    this.map = null;
    this.loadedMapFile = "";
  }
}

function isStaggeredIndex(value: number, staggerindex: "odd" | "even" = "odd"): boolean {
  return staggerindex === "odd" ? value % 2 === 1 : value % 2 === 0;
}

async function loadMap(path: string): Promise<TiledMapData> {
  let promise = mapCache.get(path);
  if (!promise) {
    promise = loadText(path).then((text) => JSON.parse(text) as TiledMapData);
    mapCache.set(path, promise);
  }
  return promise;
}

function loadText(path: string): Promise<string> {
  if (typeof fetch === "function") {
    return fetch(path).then((response) => {
      if (!response.ok) throw new Error(`Failed to load Tiled map: ${path}`);
      return response.text();
    });
  }

  const text = loadTextFile(path);
  if (text === null) throw new Error(`Failed to load Tiled map: ${path}`);
  return Promise.resolve(text);
}

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling;
}
