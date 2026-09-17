import { GLSLShader } from '../engine'
import { instantiate } from '../engine/core/instantiate'
import { Node } from '../engine/core/Node'

export const plasmaFragmentShader = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;
  varying vec2 v_uv;

  void main() {
    vec2 uv = v_uv;
    float wave = sin(uv.x * 12.0 + u_time)
      + sin(uv.y * 10.0 - u_time * 1.4)
      + sin((uv.x + uv.y) * 9.0 + u_time * 0.7);
    vec3 color = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + wave + u_time * 0.35);
    gl_FragColor = vec4(color * 0.32, 1.0);
  }
`

/** Attach this behind a scene's content to demonstrate a time-driven GLSL background. */
export function addShaderDemoBackground(root: Node): GLSLShader {
  const shader = instantiate(GLSLShader, { fragment: plasmaFragmentShader })
  root.addChild(shader.node)
  shader.node.anchorX = 0
  shader.node.anchorY = 0
  shader.node.width = root.width
  shader.node.height = root.height
  shader.node.zIndex = -1
  let elapsed = 0
  shader.node.schedule((dt: number) => {
    elapsed += dt
    shader.node.width = root.width
    shader.node.height = root.height
    shader.setUniform('u_time', elapsed)
  }, 0)
  return shader
}
