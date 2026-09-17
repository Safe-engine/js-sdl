import * as sdl3 from 'sdl3'
import type { GLSLProgram, GLSLUniformValue } from 'sdl3'
import { AssetManager, TextureAsset } from '../AssetManager'
import { spriteFrameCache } from '../SpriteFrameCache'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'
import { ComponentX } from '../core/ComponentX'

export type { GLSLUniformValue }

export interface GLSLShaderProps {
  /** Vertex source. It must declare `attribute vec2 a_position`. */
  vertex?: string
  /** Fragment source to compile. */
  fragment: string
  /** Texture path (or cached sprite-frame name) bound to `u_texture`. */
  texture?: string
  /** Sampler uniform name. Defaults to `u_texture`. */
  textureUniform?: string
  uniforms?: Record<string, GLSLUniformValue>
}

const DEFAULT_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_uv;
  uniform vec2 u_resolution;
  varying vec2 v_uv;

  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_uv = a_uv;
  }
`

/** Renders a node-sized quad through a user-provided WebGL 1 GLSL shader. */
export class GLSLShader extends ComponentX<GLSLShaderProps> {
  private program: GLSLProgram | null = null
  private texture: TextureAsset | null = null
  private texturePath = ''
  private started = false

  setUniform(name: string, value: GLSLUniformValue): void {
    if (!this.props.uniforms) this.props.uniforms = {}
    this.props.uniforms[name] = value
  }

  setTexture(path?: string): void {
    if (path === this.texturePath) return
    this.texture?.release()
    this.texture = null
    this.texturePath = path ?? ''
    this.props.texture = path
    if (this.started) this.ensureTexture()
  }

  onStart(): void {
    if (!sdl3.createGLSLProgram) {
      throw new Error('GLSLShader requires the WebGL renderer')
    }
    this.program = sdl3.createGLSLProgram(this.props.vertex ?? DEFAULT_VERTEX_SHADER, this.props.fragment)
    this.started = true
    this.ensureTexture()
  }

  onRender(): void {
    if (!this.program) return
    // Submit earlier sprite commands so scene order is preserved around this immediate draw.
    globalCommandBuffer.submit()
    const topLeft = this.node.contentToWorld(0, 0)
    const topRight = this.node.contentToWorld(this.node.width, 0)
    const bottomLeft = this.node.contentToWorld(0, this.node.height)
    const bottomRight = this.node.contentToWorld(this.node.width, this.node.height)
    const [logicalWidth, logicalHeight] = sdl3.getViewportMetrics()
    sdl3.drawGLSLQuad(this.program, new Float32Array([
      topLeft.x, topLeft.y, topRight.x, topRight.y, bottomLeft.x, bottomLeft.y,
      bottomLeft.x, bottomLeft.y, topRight.x, topRight.y, bottomRight.x, bottomRight.y,
    ]), {
      u_resolution: [logicalWidth, logicalHeight],
      ...this.props.uniforms,
    }, {
      textureId: this.texture?.id,
      textureUniform: this.props.textureUniform,
    })
  }

  onDestroy(): void {
    if (this.program) sdl3.destroyGLSLProgram(this.program)
    this.program = null
    this.texture?.release()
    this.texture = null
  }

  private ensureTexture(): void {
    const path = this.props.texture
    if (!path || (this.texture && this.texturePath === path)) return
    this.texture?.release()
    this.texturePath = path
    const spriteFrame = spriteFrameCache.get(path)
    this.texture = AssetManager.acquireTexture(spriteFrame?.texturePath ?? path)
  }
}
