import { describe, expect, it } from 'bun:test'
import { Node } from '../engine/core/Node'
import { Kine2D, type KineAtlasData, type KineSkeletonData } from '../engine/kine2d'
import { CMD_DRAW_MESH, CMD_DRAW_QUAD, CMD_DRAW_REGION, globalCommandBuffer } from '../engine/render/RenderCommandBuffer'

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

  it('composes region attachments with non-uniform node scale correctly', () => {
    const render = (boneRotation: number) => {
      const skeleton = {
        canvasSize: { width: 100, height: 180 },
        bones: [{ name: 'bone', x: 10, y: 20, rotation: boneRotation }],
        slots: [{
          name: 'region',
          bone: 'bone',
          attachments: [{ path: 'region.png', size: { width: 10, height: 4 } }],
          displayIndex: 0,
        }],
        animations: {},
      } as unknown as KineSkeletonData
      const atlas: KineAtlasData = {
        image: 'atlas.png',
        regions: [{ path: 'region.png', x: 0, y: 0, width: 10, height: 4 }],
      }
      const parent = new Node('parent')
      parent.scaleX = 2
      const kine = new Kine2D({ data: skeleton, atlas })
      parent.addChild(new Node('kine')).addComponent(kine)
      const internals = kine as unknown as {
        skeleton: KineSkeletonData
        atlas: KineAtlasData
        texture: { id: number, width: number, height: number }
      }
      internals.skeleton = skeleton
      internals.atlas = atlas
      internals.texture = { id: 7, width: 10, height: 4 }
      globalCommandBuffer.beginFrame()
      kine.onRender()
      return globalCommandBuffer.getBufferView()
    }

    // Rotated 90 degrees, the attachment's 4px height lies along the node's
    // x axis, which the parent stretches by 2: it must draw 10 wide, 8 tall.
    const upright = render(90)
    expect(upright.commands[0]).toBe(CMD_DRAW_REGION)
    const [, , , , dx, dy, dw, dh, angle, cx, cy] = upright.floatBuffer
    expect(dw).toBeCloseTo(10)
    expect(dh).toBeCloseTo(8)
    expect(angle).toBeCloseTo(90)
    // Attachment centre: bone (10, 20) + R(90) * (5, 0) = (10, 25), then x * 2.
    expect(dx + cx).toBeCloseTo(20)
    expect(dy + cy).toBeCloseTo(25)

    // At 45 degrees the same stretch shears the rectangle into a quad.
    expect(render(45).commands[0]).toBe(CMD_DRAW_QUAD)
  })

  it('keeps the previous region output under uniform node scale', () => {
    const bone = { name: 'bone', x: 12, y: 30, rotation: 30, scaleX: 1.5, scaleY: 0.5 }
    const attachment = { path: 'region.png', size: { width: 10, height: 4 }, x: 2, y: 3, rotation: 15 }
    const skeleton = {
      canvasSize: { width: 100, height: 180 },
      bones: [bone],
      slots: [{ name: 'region', bone: 'bone', attachments: [attachment], displayIndex: 0 }],
      animations: {},
    } as unknown as KineSkeletonData
    const atlas: KineAtlasData = {
      image: 'atlas.png',
      regions: [{ path: 'region.png', x: 0, y: 0, width: 10, height: 4 }],
    }
    const node = new Node('kine')
    node.x = 50
    node.y = 70
    node.rotation = 20
    node.scale = 2
    const kine = new Kine2D({ data: skeleton, atlas })
    node.addComponent(kine)
    const internals = kine as unknown as {
      skeleton: KineSkeletonData
      atlas: KineAtlasData
      texture: { id: number, width: number, height: number }
    }
    internals.skeleton = skeleton
    internals.atlas = atlas
    internals.texture = { id: 7, width: 10, height: 4 }
    globalCommandBuffer.beginFrame()
    kine.onRender()
    const view = globalCommandBuffer.getBufferView()

    // The formula used before composing with the node matrix.
    const scaleX = bone.scaleX
    const scaleY = bone.scaleY
    const boneRadians = bone.rotation * Math.PI / 180
    const centerX = attachment.x + (attachment.size.width * scaleX) / 2
    const centerY = attachment.y
    const boneWorldX = bone.x + centerX * Math.cos(boneRadians) - centerY * Math.sin(boneRadians)
    const boneWorldY = bone.y + centerX * Math.sin(boneRadians) + centerY * Math.cos(boneRadians)
    const cosine = Math.cos(node.renderRotation * Math.PI / 180)
    const sine = Math.sin(node.renderRotation * Math.PI / 180)
    const localX = boneWorldX * node.renderScaleX
    const localY = boneWorldY * node.renderScaleY
    const width = attachment.size.width * scaleX * node.renderScaleX
    const height = attachment.size.height * scaleY * node.renderScaleY
    const expected = [
      node.renderX + localX * cosine - localY * sine - width / 2,
      node.renderY + localX * sine + localY * cosine - height / 2,
      width,
      height,
      node.renderRotation + bone.rotation + attachment.rotation,
      width / 2,
      height / 2,
    ]

    expect(view.commands[0]).toBe(CMD_DRAW_REGION)
    const actual = [...view.floatBuffer.slice(4, 11)]
    expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 3))
  })
})
