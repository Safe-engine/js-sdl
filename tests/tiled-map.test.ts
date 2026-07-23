import { describe, expect, mock, test } from 'bun:test'

const tiledMapJson = JSON.stringify({
  width: 1,
  height: 1,
  tilewidth: 16,
  tileheight: 16,
  layers: [
    {
      name: 'map',
      type: 'tilelayer',
      width: 1,
      height: 1,
      data: [1],
    },
  ],
  tilesets: [
    {
      columns: 1,
      firstgid: 1,
      image: 'tiles.png',
      imageheight: 16,
      imagewidth: 16,
      tilecount: 1,
      tileheight: 16,
      tilewidth: 16,
    },
  ],
})

mock.module('sdl3', () => ({
  submitCommandBuffer: () => {},
  drawTextureMesh: () => {},
  drawTextureRegionRotated: () => {},
  getTextureHeight: () => 16,
  getTextureWidth: () => 16,
  loadTextFile: () => tiledMapJson,
  loadTexture: () => 1,
  releaseTexture: () => {},
}))

const { TiledMap, TiledMapLayer } = await import('../engine/components/TiledMap')
const { loadTextAsset } = await import('../engine/helper/text-resource')

describe('TiledMap compatibility helpers', () => {
  test('hydrates a preloaded map before onStart', async () => {
    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = async () => ({
      ok: true,
      text: async () => tiledMapJson,
    })

    try {
      const mapFile = 'res/Map/Preloaded.json'
      await loadTextAsset(mapFile)

      const tiledMap = new TiledMap({ mapFile })
      tiledMap.ensureNode()

      expect(tiledMap.getLayer('map').getTileAt(0, 0)).toBe(1)
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  test('shares an in-flight reload for the same map file', async () => {
    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = async () => ({
      ok: true,
      text: async () => tiledMapJson,
    })

    try {
      const tiledMap = new TiledMap({ mapFile: 'res/Map/Reload.json' })
      tiledMap.ensureNode()

      const firstReload = tiledMap.reload()
      const loadingPromise = (tiledMap as any).loadingPromise
      const secondReload = tiledMap.reload()

      expect((tiledMap as any).loadingPromise).toBe(loadingPromise)
      await Promise.all([firstReload, secondReload])
      expect(tiledMap.getLayer('map').getTileAt(0, 0)).toBe(1)
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  test('returns tile positions in the tiled-map node local space', () => {
    const tiledMap = new TiledMap({ mapFile: 'res/Map/Map1.json' })
    tiledMap.ensureNode()
    tiledMap.node.anchorX = 0.5
    tiledMap.node.anchorY = 0.5

    ;(tiledMap as any).map = {
      width: 4,
      height: 3,
      tilewidth: 10,
      tileheight: 20,
      layers: [
        { name: 'map', type: 'tilelayer', width: 4, height: 3, x: 0, y: 0 },
      ],
      tilesets: [
        {
          columns: 1,
          firstgid: 1,
          image: 'tiles.png',
          imageheight: 20,
          imagewidth: 10,
          tilecount: 1,
          tileheight: 20,
          tilewidth: 10,
        },
      ],
    }

    const layer = tiledMap.getLayer('map')
    const position = layer.getPositionAt(1, 2)

    expect(layer).toBeInstanceOf(TiledMapLayer)
    expect(position).toEqual({ x: -10, y: 10 })
  })

  test('applies staggered coordinates and layer offsets', () => {
    const tiledMap = new TiledMap({ mapFile: 'res/Map/Map1.json' })
    tiledMap.ensureNode()

    ;(tiledMap as any).map = {
      width: 8,
      height: 80,
      tilewidth: 120,
      tileheight: 67,
      orientation: 'staggered',
      staggeraxis: 'y',
      staggerindex: 'odd',
      layers: [
        { name: 'map', type: 'tilelayer', width: 8, height: 80, x: 1, y: 2 },
      ],
      tilesets: [
        {
          columns: 1,
          firstgid: 1,
          image: 'tiles.png',
          imageheight: 67,
          imagewidth: 120,
          tilecount: 1,
          tileheight: 67,
          tilewidth: 120,
        },
      ],
    }

    const position = tiledMap.getLayer('map').getPositionAt(4, 42)

    expect(position).toEqual({ x: 90, y: 117.25 })
  })

  test('returns decoded tile gids from getTileAt', () => {
    const tiledMap = new TiledMap({ mapFile: 'res/Map/Map1.json' })
    tiledMap.ensureNode()

    ;(tiledMap as any).map = {
      width: 2,
      height: 2,
      tilewidth: 16,
      tileheight: 16,
      layers: [
        {
          name: 'map',
          type: 'tilelayer',
          width: 2,
          height: 2,
          data: [0, 7, 0x80000005, 0],
        },
      ],
      tilesets: [
        {
          columns: 1,
          firstgid: 1,
          image: 'tiles.png',
          imageheight: 16,
          imagewidth: 16,
          tilecount: 7,
          tileheight: 16,
          tilewidth: 16,
        },
      ],
    }

    const layer = tiledMap.getLayer('map')

    expect(layer.getTileAt(0, 0)).toBeNull()
    expect(layer.getTileAt(1, 0)).toBe(7)
    expect(layer.getTileAt(0, 1)).toBe(5)
    expect(layer.getTileAt(2, 0)).toBeNull()
  })

  test('offsets an individual tile without moving the rest of the map', () => {
    const tiledMap = new TiledMap({ mapFile: 'res/Map/Map1.json' })
    tiledMap.ensureNode()

    ;(tiledMap as any).map = JSON.parse(tiledMapJson)
    ;(tiledMap as any).tilesets = [{
      data: (tiledMap as any).map.tilesets[0],
      firstgid: 1,
      lastgid: 1,
      imagePath: 'tiles.png',
      texture: { id: 1, width: 16, height: 16 },
    }]
    ;(tiledMap as any).tiles = (tiledMap as any).buildTiles()

    tiledMap.setTileOffset('map', 0, 0, 0, 6)

    expect((tiledMap as any).tiles[0].y).toBe(6)
  })
})
