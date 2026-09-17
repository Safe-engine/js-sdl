import { describe, expect, it } from 'bun:test'
import { Node } from '../engine/core/Node'
import { Kine2D, type KineAtlasData, type KineSkeletonData } from '../engine/kine2d'
import { CMD_DRAW_MESH, globalCommandBuffer } from '../engine/render/RenderCommandBuffer'

describe('Kine2D', () => {
  it('skins weighted mesh vertices with the animated bone pose', () => {
    const skeleton = {
      canvasSize: { width: 100, height: 180 },
      bones: [{ name: 'bone', x: 0, y: 0, rotation: 0 }],
      slots: [{
        name: 'mesh',
        bone: 'bone',
        attachments: [{
          path: 'mesh.png',
          mesh: {
            vertices: [0, 0, 10, 0, 0, 10],
            uvs: [0, 0, 1, 0, 0, 1],
            triangles: [0, 1, 2],
            weights: [{ bone: 1 }, { bone: 1 }, { bone: 1 }],
          },
        }],
        displayIndex: 0,
      }],
      animations: {
        move: {
          length: 2,
          fps: 1,
          keyframes: {
            bone: {
              0: { x: 0 },
              1: { x: 10 },
            },
          },
        },
      },
    } as unknown as KineSkeletonData
    const atlas: KineAtlasData = {
      image: 'atlas.png',
      regions: [{ path: 'mesh.png', x: 0, y: 0, width: 10, height: 10 }],
    }
    const kine = new Kine2D({ data: skeleton, atlas, animation: 'move' })
    new Node().addComponent(kine)
    const internals = kine as unknown as {
      skeleton: KineSkeletonData
      atlas: KineAtlasData
      texture: { id: number, width: number, height: number }
    }
    internals.skeleton = skeleton
    internals.atlas = atlas
    internals.texture = { id: 7, width: 10, height: 10 }

    globalCommandBuffer.beginFrame()
    kine.onRender()
    const initial = [...globalCommandBuffer.getBufferView().floatBuffer.slice(0, 6)]

    kine.onUpdate(0.5)
    globalCommandBuffer.beginFrame()
    kine.onRender()
    const animated = [...globalCommandBuffer.getBufferView().floatBuffer.slice(0, 6)]

    expect(globalCommandBuffer.getBufferView().commands[0]).toBe(CMD_DRAW_MESH)
    expect(initial).toEqual([0, 0, 10, 0, 0, 10])
    expect(animated).toEqual([5, 0, 15, 0, 5, 10])
  })

  it('applies the root mirror while interpolating wrapped rotations along the shortest arc', () => {
    const skeleton = {
      canvasSize: { width: 100, height: 180 },
      bones: [{ name: 'bone', x: 0, y: 0, rotation: 180 }],
      slots: [{
        name: 'mesh',
        bone: 'bone',
        attachments: [{
          path: 'mesh.png',
          mesh: {
            vertices: [10, 0, 0, 0, 0, 10],
            uvs: [1, 0, 0, 0, 0, 1],
            triangles: [0, 1, 2],
            weights: [{ bone: 1 }, { bone: 1 }, { bone: 1 }],
          },
        }],
        displayIndex: 0,
      }],
      animations: {
        turn: {
          length: 2,
          fps: 1,
          keyframes: {
            bone: {
              0: { rotation: 180 },
              1: { rotation: -170 },
            },
          },
        },
      },
    } as unknown as KineSkeletonData
    const atlas: KineAtlasData = {
      image: 'atlas.png',
      regions: [{ path: 'mesh.png', x: 0, y: 0, width: 10, height: 10 }],
    }
    const kine = new Kine2D({ data: skeleton, atlas, animation: 'turn' })
    new Node().addComponent(kine)
    const internals = kine as unknown as {
      skeleton: KineSkeletonData
      atlas: KineAtlasData
      texture: { id: number, width: number, height: number }
    }
    internals.skeleton = skeleton
    internals.atlas = atlas
    internals.texture = { id: 7, width: 10, height: 10 }

    kine.onUpdate(0.5)
    globalCommandBuffer.beginFrame()
    kine.onRender()
    const { floatBuffer } = globalCommandBuffer.getBufferView()
    const [x, y] = floatBuffer

    expect(x).toBeCloseTo(-9.96, 1)
    expect(y).toBeCloseTo(-0.87, 1)
    expect(floatBuffer[6]).toBe(1)
  })

  it('uses the slot bone bind transform for mesh geometry', () => {
    const skeleton = {
      canvasSize: { width: 100, height: 180 },
      bones: [
        { name: 'root', x: 0, y: 0, rotation: 180, scaleX: 1, scaleY: -1 },
        {
          name: 'slot',
          parent: 'root',
          x: 10,
          y: 20,
          rotation: -90,
          scaleX: 2,
          scaleY: 3,
        },
      ],
      slots: [{
        name: 'mesh',
        bone: 'slot',
        attachments: [{
          path: 'mesh.png',
          mesh: {
            vertices: [1, 1, 0, 0, 0, 1],
            uvs: [0, 0, 1, 0, 0, 1],
            triangles: [0, 1, 2],
            weights: [{ slot: 1 }, { slot: 1 }, { slot: 1 }],
          },
        }],
        displayIndex: 0,
      }],
      animations: {},
    } as unknown as KineSkeletonData
    const atlas: KineAtlasData = {
      image: 'atlas.png',
      regions: [{ path: 'mesh.png', x: 0, y: 0, width: 10, height: 10 }],
    }
    const kine = new Kine2D({ data: skeleton, atlas })
    new Node().addComponent(kine)
    const internals = kine as unknown as {
      skeleton: KineSkeletonData
      atlas: KineAtlasData
      texture: { id: number, width: number, height: number }
    }
    internals.skeleton = skeleton
    internals.atlas = atlas
    internals.texture = { id: 7, width: 10, height: 10 }

    globalCommandBuffer.beginFrame()
    kine.onRender()
    const [x, y] = globalCommandBuffer.getBufferView().floatBuffer

    expect(x).toBeCloseTo(13)
    expect(y).toBeCloseTo(18)
  })
})
