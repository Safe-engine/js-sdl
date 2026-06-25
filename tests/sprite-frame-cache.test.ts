import { describe, expect, mock, test } from 'bun:test'

mock.module('sdl3', () => ({
  loadTextFile: () => null,
}))

const {
  parseSpriteAtlasFrames,
  SpriteFrameCache,
} = await import('../engine/SpriteFrameCache')

describe('SpriteFrameCache', () => {
  test('parses object atlas frames', () => {
    expect(parseSpriteAtlasFrames({
      frames: {
        button: { frame: { x: 4, y: 8, w: 16, h: 24 } },
      },
    })).toEqual({
      button: { x: 4, y: 8, width: 16, height: 24 },
    })
  })

  test('registers texture and atlas-backed sprite frames', () => {
    const cache = new SpriteFrameCache()

    cache.addTexture('hero', 'res/Texture/hero.png')
    cache.addAtlas('res/Texture/ui.png', {
      frames: {
        play: { x: 10, y: 20, width: 30, height: 40 },
      },
    })

    expect(cache.get('hero')).toEqual({
      texturePath: 'res/Texture/hero.png',
      region: null,
    })
    expect(cache.get('play')).toEqual({
      texturePath: 'res/Texture/ui.png',
      region: { x: 10, y: 20, width: 30, height: 40 },
    })
  })
})
