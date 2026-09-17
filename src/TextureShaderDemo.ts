import { GLSLShader } from '../engine'
import { instantiate } from '../engine/core/instantiate'

export const textureWaveFragmentShader = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float u_time;
  varying vec2 v_uv;

  void main() {
    vec2 uv = v_uv;
    uv.x += sin(uv.y * 18.0 + u_time * 3.0) * 0.012;
    vec4 texel = texture2D(u_texture, uv);
    gl_FragColor = vec4(texel.rgb * vec3(0.55, 0.9, 1.35), texel.a);
  }
`

/** A texture-backed shader: `u_texture` is bound automatically from `texture`. */
export function createTextureShaderDemo(): GLSLShader {
  return instantiate(GLSLShader, {
    fragment: textureWaveFragmentShader,
    texture: 'Texture/player.png',
  })
}
