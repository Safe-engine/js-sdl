import { beforeAll, describe, expect, test } from 'bun:test'
import { Camera2D } from '../engine/components/Camera2D'
import { GLSLShader } from '../engine/components/GLSLShader'
import { ComponentX } from '../engine/core/ComponentX'
import { Node } from '../engine/core/Node'
import { Scene } from '../engine/core/Scene'
import { globalCommandBuffer } from '../engine/render/RenderCommandBuffer'
import { installSdl3 } from './setup/sdl3'

const submits: number[] = []
const quads: Float32Array[] = []

beforeAll(() => {
  installSdl3({
    createGLSLProgram: () => ({}) as any,
    drawGLSLQuad: (_program: unknown, positions: Float32Array) => {
      quads.push(positions)
    },
    getViewportMetrics: () => [800, 600, 800, 600, 0, 0, 800, 600, 0, 0, 800, 600],
    submitCommandBuffer: (buffer: { commands: Int32Array }) => {
      submits.push(buffer.commands.length)
    },
  })
})

class Quad extends ComponentX {
  override onRender(): void {
    globalCommandBuffer.pushSprite(1, 0, 0, 1, 1)
  }
}

describe('GLSLShader', () => {
  test('keeps batching commands issued after the shader in the same frame', () => {
    submits.length = 0
    const root = new Node('root')
    root.addChild(new Node('before')).addComponent(Quad)
    root.addChild(new Node('shader')).addComponent(GLSLShader, { fragment: 'void main() {}' })
    root.addChild(new Node('after-1')).addComponent(Quad)
    root.addChild(new Node('after-2')).addComponent(Quad)
    root._startTree()

    globalCommandBuffer.beginFrame()
    root._renderTree()
    globalCommandBuffer.submit()

    // One flush before the shader draw, one for the two trailing sprites.
    expect(submits).toEqual([1, 2])
  })

  test('draws through the active camera', () => {
    quads.length = 0
    const scene = new Scene()
    scene.node.width = 800
    scene.node.height = 600
    const cameraNode = scene.node.addChild(new Node('camera'))
    cameraNode.x = 100
    cameraNode.addComponent(Camera2D)

    const shaderNode = scene.node.addChild(new Node('shader'))
    shaderNode.anchorX = 0
    shaderNode.anchorY = 0
    shaderNode.x = 500
    shaderNode.y = 300
    shaderNode.width = 10
    shaderNode.height = 10
    shaderNode.addComponent(GLSLShader, { fragment: 'void main() {}' })
    scene.node._startTree()

    scene.render()

    // Camera at (100, 0) centred in an 800x600 viewport shifts content by (+300, +300).
    expect(quads).toHaveLength(1)
    expect(quads[0][0]).toBe(800)
    expect(quads[0][1]).toBe(600)
  })
})
