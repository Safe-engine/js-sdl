export const isNative = false

let canvas: HTMLCanvasElement | null = null
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let batchVbo: WebGLBuffer | null = null
let positionLocation = -1
let uvLocation = -1
let colorLocation = -1
let resolutionLocation: WebGLUniformLocation | null = null
let samplerLocation: WebGLUniformLocation | null = null
let whiteTexture: WebGLTexture | null = null
let whiteTextureAsset: TextureAsset | null = null
let shaderPositionBuffer: WebGLBuffer | null = null
let shaderUvBuffer: WebGLBuffer | null = null
const clipStack: Array<[number, number, number, number]> = []
let logicalWidth = 1
let logicalHeight = 1
let designedLogicalWidth = 1
let designedLogicalHeight = 1
let resolutionPolicy: ResolutionPolicy = 'letterbox'
let nextTextureId = 0
let nextFontId = 0
let nextAudioId = 0
let nextAudioVoiceId = 0
let running = false
let lastFrameTime = 0
let frameDrawCalls = 0
let frameVertices = 0
let pointerDown = false
let resizeObserver: ResizeObserver | null = null

export const textures = new Map<number, TextureAsset>()
const textureIds = new Map<string, number>()
const fonts = new Map<number, FontAsset>()
const fontIds = new Map<string, number>()
const audioAssets = new Map<number, AudioAsset>()
const audioIds = new Map<string, number>()
const audioVoices = new Map<number, AudioVoice>()

let initCallback: VoidCallback | null = null
let updateCallback: UpdateCallback | null = null
let renderCallback: VoidCallback | null = null
let touchStartCallback: TouchCallback | null = null
let touchMoveCallback: TouchCallback | null = null
let touchEndCallback: TouchCallback | null = null
let textInputCallback: TextInputCallback | null = null
let keyDownCallback: KeyCallback | null = null
let keyUpCallback: KeyCallback | null = null
let pauseCallback: VoidCallback | null = null
let resumeCallback: VoidCallback | null = null
let backgroundCallback: VoidCallback | null = null
let foregroundCallback: VoidCallback | null = null
let interruptionCallback: InterruptionCallback | null = null
let lowMemoryCallback: VoidCallback | null = null
let orientationCallback: OrientationCallback | null = null
let terminateCallback: VoidCallback | null = null
let hiddenTextInput: HTMLInputElement | null = null

export interface RendererStats {
  fps: number
  frameTimeMs: number
  drawCalls: number
  vertices: number
}

export type GLSLUniformValue = number | readonly [number, number] | readonly [number, number, number] | readonly [number, number, number, number]

export interface GLSLProgram {
  program: WebGLProgram
  positionLocation: number
  uniforms: Map<string, WebGLUniformLocation | null>
}

export interface GLSLQuadOptions {
  textureId?: number
  textureUniform?: string
  uvs?: Float32Array
}

const rendererStats: RendererStats = {
  fps: 0,
  frameTimeMs: 0,
  drawCalls: 0,
  vertices: 0,
}

const VERTEX_STRIDE_BYTES = 20
const VERTEX_STRIDE_FLOATS = 5
const MAX_BATCH_VERTICES = 6000
const batchArrayBuffer = new ArrayBuffer(MAX_BATCH_VERTICES * VERTEX_STRIDE_BYTES)
const batchFloatView = new Float32Array(batchArrayBuffer)
const batchUint32View = new Uint32Array(batchArrayBuffer)
let batchVertexCount = 0
let batchTexture: WebGLTexture | null = null
let batchAdditive = false

function packColor(red: number, green: number, blue: number, alpha: number): number {
  const r = Math.max(0, Math.min(255, Math.round(red))) & 0xff
  const g = Math.max(0, Math.min(255, Math.round(green))) & 0xff
  const b = Math.max(0, Math.min(255, Math.round(blue))) & 0xff
  const a = Math.max(0, Math.min(255, Math.round(alpha))) & 0xff
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
}

function colorToUniform(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): [number, number, number, number] {
  return [
    Math.max(0, Math.min(255, red)) / 255,
    Math.max(0, Math.min(255, green)) / 255,
    Math.max(0, Math.min(255, blue)) / 255,
    Math.max(0, Math.min(255, alpha)) / 255,
  ]
}

function sameBatch(
  texture: WebGLTexture,
  additive: boolean,
): boolean {
  return batchTexture === texture && batchAdditive === additive
}

function queueDraw(
  asset: TextureAsset,
  positions: readonly number[] | Float32Array,
  uvs: readonly number[] | Float32Array,
  color: [number, number, number, number] | number,
  additive = false,
): void {
  if (!asset.texture || !program || !batchVbo) return
  const vertexCount = positions.length / 2
  frameVertices += vertexCount
  if (!sameBatch(asset.texture, additive)
    || batchVertexCount + vertexCount > MAX_BATCH_VERTICES) {
    flushDrawBatch()
  }

  batchTexture = asset.texture
  batchAdditive = additive

  const packed = typeof color === 'number'
    ? color
    : packColor(color[0] * 255, color[1] * 255, color[2] * 255, color[3] * 255)

  for (let i = 0; i < vertexCount; i++) {
    const offset = (batchVertexCount + i) * VERTEX_STRIDE_FLOATS
    batchFloatView[offset] = positions[i * 2]
    batchFloatView[offset + 1] = positions[i * 2 + 1]
    batchFloatView[offset + 2] = uvs[i * 2]
    batchFloatView[offset + 3] = uvs[i * 2 + 1]
    batchUint32View[offset + 4] = packed
  }
  batchVertexCount += vertexCount
}

function flushDrawBatch(): void {
  if (!batchTexture || batchVertexCount === 0) return
  if (!program || !batchVbo) {
    batchTexture = null
    batchAdditive = false
    batchVertexCount = 0
    return
  }

  const context = requireGl()
  context.blendFunc(context.ONE, batchAdditive ? context.ONE : context.ONE_MINUS_SRC_ALPHA)
  context.useProgram(program)
  context.uniform2f(resolutionLocation, logicalWidth, logicalHeight)
  context.uniform1i(samplerLocation, 0)
  context.activeTexture(context.TEXTURE0)
  context.bindTexture(context.TEXTURE_2D, batchTexture)

  context.bindBuffer(context.ARRAY_BUFFER, batchVbo)
  context.bufferSubData(context.ARRAY_BUFFER, 0, batchFloatView.subarray(0, batchVertexCount * VERTEX_STRIDE_FLOATS))

  context.enableVertexAttribArray(positionLocation)
  context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, VERTEX_STRIDE_BYTES, 0)

  context.enableVertexAttribArray(uvLocation)
  context.vertexAttribPointer(uvLocation, 2, context.FLOAT, false, VERTEX_STRIDE_BYTES, 8)

  context.enableVertexAttribArray(colorLocation)
  context.vertexAttribPointer(colorLocation, 4, context.UNSIGNED_BYTE, true, VERTEX_STRIDE_BYTES, 16)

  context.drawArrays(context.TRIANGLES, 0, batchVertexCount)
  frameDrawCalls += 1

  batchTexture = null
  batchAdditive = false
  batchVertexCount = 0
}

function ensureHiddenTextInput(): HTMLInputElement {
  if (hiddenTextInput) return hiddenTextInput
  const input = document.createElement('input')
  input.type = 'text'
  input.autocomplete = 'off'
  input.autocapitalize = 'off'
  input.spellcheck = false
  input.tabIndex = -1
  input.setAttribute('aria-label', 'Text input')
  input.style.position = 'fixed'
  input.style.left = '0'
  input.style.top = '0'
  input.style.width = '1px'
  input.style.height = '1px'
  input.style.opacity = '0.001'
  input.style.border = 'none'
  input.style.outline = 'none'
  input.style.padding = '0'
  input.style.margin = '0'
  input.style.pointerEvents = 'none'
  input.style.zIndex = '-1'

  let isComposing = false
  input.addEventListener('compositionstart', () => {
    isComposing = true
  })
  input.addEventListener('compositionend', (event) => {
    isComposing = false
    if (event.data) {
      textInputCallback?.(event.data)
      input.value = ''
    }
  })
  input.addEventListener('input', (event) => {
    if (isComposing) return
    const val = input.value
    const data = (event as InputEvent).data ?? val
    if (data) {
      textInputCallback?.(data)
      input.value = ''
    }
  })
  document.body.appendChild(input)
  hiddenTextInput = input
  return input
}

function compileShader(type: number, source: string): WebGLShader {
  const context = requireGl()
  const shader = context.createShader(type)
  if (!shader) throw new Error('Unable to create WebGL shader')
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const message = context.getShaderInfoLog(shader) ?? 'Unknown shader error'
    context.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(): WebGLProgram {
  const context = requireGl()
  const vertexShader = compileShader(context.VERTEX_SHADER, `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    attribute vec4 a_color;
    uniform vec2 u_resolution;
    varying vec2 v_uv;
    varying vec4 v_color;

    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      v_uv = a_uv;
      v_color = a_color;
    }
  `)
  const fragmentShader = compileShader(context.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_texture;
    varying vec2 v_uv;
    varying vec4 v_color;

    void main() {
      vec4 color = vec4(v_color.rgb * v_color.a, v_color.a);
      gl_FragColor = texture2D(u_texture, v_uv) * color;
    }
  `)
  const result = context.createProgram()
  if (!result) throw new Error('Unable to create WebGL program')
  context.attachShader(result, vertexShader)
  context.attachShader(result, fragmentShader)
  context.linkProgram(result)
  context.deleteShader(vertexShader)
  context.deleteShader(fragmentShader)
  if (!context.getProgramParameter(result, context.LINK_STATUS)) {
    throw new Error(context.getProgramInfoLog(result) ?? 'WebGL link failed')
  }
  return result
}

/** Compile a GLSL program for use with drawGLSLQuad(). */
export function createGLSLProgram(vertexSource: string, fragmentSource: string): GLSLProgram {
  const context = requireGl()
  const vertexShader = compileShader(context.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(context.FRAGMENT_SHADER, fragmentSource)
  const result = context.createProgram()
  if (!result) throw new Error('Unable to create WebGL program')
  context.attachShader(result, vertexShader)
  context.attachShader(result, fragmentShader)
  context.linkProgram(result)
  context.deleteShader(vertexShader)
  context.deleteShader(fragmentShader)
  if (!context.getProgramParameter(result, context.LINK_STATUS)) {
    context.deleteProgram(result)
    throw new Error(context.getProgramInfoLog(result) ?? 'WebGL link failed')
  }
  return {
    program: result,
    positionLocation: context.getAttribLocation(result, 'a_position'),
    uniforms: new Map(),
  }
}

/** Draw two triangles using a GLSLProgram. The vertex shader must declare `a_position`. */
export function drawGLSLQuad(
  shader: GLSLProgram,
  positions: Float32Array,
  uniforms: Record<string, GLSLUniformValue>,
  options: GLSLQuadOptions = {},
): void {
  if (positions.length !== 12 || shader.positionLocation < 0) return
  if (options.textureId !== undefined && !textures.get(options.textureId)?.texture) return
  const uvs = options.uvs ?? new Float32Array([
    0, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 1,
  ])
  if (uvs.length !== positions.length) return
  flushDrawBatch()
  const context = requireGl()
  if (!shaderPositionBuffer) shaderPositionBuffer = context.createBuffer()
  if (!shaderPositionBuffer) throw new Error('Unable to create shader position buffer')

  context.useProgram(shader.program)
  for (const [name, value] of Object.entries(uniforms)) {
    let location = shader.uniforms.get(name)
    if (location === undefined) {
      location = context.getUniformLocation(shader.program, name)
      shader.uniforms.set(name, location)
    }
    if (!location) continue
    if (typeof value === 'number') context.uniform1f(location, value)
    else if (value.length === 2) context.uniform2f(location, value[0], value[1])
    else if (value.length === 3) context.uniform3f(location, value[0], value[1], value[2])
    else context.uniform4f(location, value[0], value[1], value[2], value[3])
  }
  context.bindBuffer(context.ARRAY_BUFFER, shaderPositionBuffer)
  context.bufferData(context.ARRAY_BUFFER, positions, context.STREAM_DRAW)
  context.enableVertexAttribArray(shader.positionLocation)
  context.vertexAttribPointer(shader.positionLocation, 2, context.FLOAT, false, 0, 0)
  const uvLocation = context.getAttribLocation(shader.program, 'a_uv')
  if (uvLocation >= 0) {
    if (!shaderUvBuffer) shaderUvBuffer = context.createBuffer()
    if (!shaderUvBuffer) throw new Error('Unable to create shader UV buffer')
    context.bindBuffer(context.ARRAY_BUFFER, shaderUvBuffer)
    context.bufferData(context.ARRAY_BUFFER, uvs, context.STREAM_DRAW)
    context.enableVertexAttribArray(uvLocation)
    context.vertexAttribPointer(uvLocation, 2, context.FLOAT, false, 0, 0)
  }
  if (options.textureId !== undefined) {
    const texture = textures.get(options.textureId)?.texture
    const textureUniform = options.textureUniform ?? 'u_texture'
    let location = shader.uniforms.get(textureUniform)
    if (location === undefined) {
      location = context.getUniformLocation(shader.program, textureUniform)
      shader.uniforms.set(textureUniform, location)
    }
    if (texture && location) {
      context.activeTexture(context.TEXTURE0)
      context.bindTexture(context.TEXTURE_2D, texture)
      context.uniform1i(location, 0)
    }
  }
  context.drawArrays(context.TRIANGLES, 0, 6)
  frameDrawCalls += 1
  frameVertices += 6
}

export function destroyGLSLProgram(shader: GLSLProgram): void {
  gl?.deleteProgram(shader.program)
}

function requireGl(): WebGLRenderingContext {
  if (!gl) throw new Error('createWindow() must be called before rendering')
  return gl
}

function assetUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\.?\//, '')
  return normalized
}

export function loadAudio(path: string): number {
  const existingId = audioIds.get(path)
  if (existingId !== undefined) {
    audioAssets.get(existingId)!.refs++
    return existingId
  }

  const id = nextAudioId++
  audioAssets.set(id, { url: assetUrl(path), refs: 1 })
  audioIds.set(path, id)
  return id
}

export function releaseAudio(id: number): void {
  const asset = audioAssets.get(id)
  if (!asset || --asset.refs > 0) return
  audioAssets.delete(id)
  for (const [path, assetId] of audioIds) {
    if (assetId === id) {
      audioIds.delete(path)
      break
    }
  }
}

export function playAudio(
  audioId: number,
  loop: boolean,
  volume: number,
): number {
  const asset = audioAssets.get(audioId)
  if (!asset) return -1

  const voiceId = nextAudioVoiceId++
  const element = new Audio(asset.url)
  const voice: AudioVoice = { element, ended: false }
  element.loop = loop
  element.volume = Math.max(0, Math.min(1, volume))
  element.preload = 'auto'
  element.addEventListener('ended', () => {
    voice.ended = true
  }, { once: true })
  audioVoices.set(voiceId, voice)
  void element.play().catch(() => {
    voice.ended = true
  })
  return voiceId
}

export function stopAudio(voiceId: number): void {
  const voice = audioVoices.get(voiceId)
  if (!voice) return
  voice.element.pause()
  voice.element.removeAttribute('src')
  voice.element.load()
  voice.ended = true
  audioVoices.delete(voiceId)
}

export function pauseAudio(voiceId: number): void {
  audioVoices.get(voiceId)?.element.pause()
}

export function resumeAudio(voiceId: number): void {
  const voice = audioVoices.get(voiceId)
  if (!voice || voice.ended) return
  void voice.element.play().catch(() => { })
}

export function setAudioVolume(voiceId: number, volume: number): void {
  const voice = audioVoices.get(voiceId)
  if (voice) voice.element.volume = Math.max(0, Math.min(1, volume))
}

export function isAudioPlaying(voiceId: number): boolean {
  const voice = audioVoices.get(voiceId)
  return !!voice && !voice.ended
}

export function updateAudio(): void {
  for (const [id, voice] of audioVoices) {
    if (voice.ended) audioVoices.delete(id)
  }
}

function uploadSource(
  asset: TextureAsset,
  source: TexImageSource,
  width: number,
  height: number,
  pma = asset.pma ?? false,
): void {
  const context = requireGl()
  const texture = asset.texture ?? context.createTexture()
  if (!texture) throw new Error(`Unable to create texture: ${asset.key}`)
  asset.texture = texture
  asset.width = width
  asset.height = height
  context.bindTexture(context.TEXTURE_2D, texture)
  context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, pma ? 0 : 1)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
  context.texImage2D(
    context.TEXTURE_2D,
    0,
    context.RGBA,
    context.RGBA,
    context.UNSIGNED_BYTE,
    source,
  )
}

function pointerPosition(event: PointerEvent): [number, number] {
  if (!canvas) return [0, 0]
  const rect = canvas.getBoundingClientRect()
  return [
    (event.clientX - rect.left) * logicalWidth / rect.width,
    (event.clientY - rect.top) * logicalHeight / rect.height,
  ]
}

function safeAreaInsets(): [number, number, number, number] {
  const style = getComputedStyle(document.documentElement)
  const value = (name: string) =>
    Number.parseFloat(style.getPropertyValue(name)) || 0
  return [
    value('--safe-area-inset-top'),
    value('--safe-area-inset-right'),
    value('--safe-area-inset-bottom'),
    value('--safe-area-inset-left'),
  ]
}

function resizeDrawingBuffer(): void {
  if (!canvas || !gl) return
  fitCanvasToViewport()
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(rect.width * ratio))
  const height = Math.max(1, Math.round(rect.height * ratio))
  if (canvas.width === width && canvas.height === height) return
  canvas.width = width
  canvas.height = height
  gl.viewport(0, 0, width, height)
}

function fitCanvasToViewport(): void {
  if (!canvas) return
  logicalWidth = designedLogicalWidth
  logicalHeight = designedLogicalHeight

  let width = window.innerWidth
  let height = window.innerHeight
  if (resolutionPolicy === 'fixed-width') {
    const scale = window.innerWidth / designedLogicalWidth
    logicalHeight = window.innerHeight / scale
  } else if (resolutionPolicy === 'fixed-height') {
    const scale = window.innerHeight / designedLogicalHeight
    logicalWidth = window.innerWidth / scale
  } else if (resolutionPolicy !== 'stretch') {
    const scale = resolutionPolicy === 'overscan'
      ? Math.max(
        window.innerWidth / logicalWidth,
        window.innerHeight / logicalHeight,
      )
      : Math.min(
        window.innerWidth / logicalWidth,
        window.innerHeight / logicalHeight,
      )
    const finalScale = resolutionPolicy === 'integer-scale'
      ? Math.max(1, Math.floor(scale))
      : scale
    width = logicalWidth * finalScale
    height = logicalHeight * finalScale
  }

  width = Math.max(1, Math.floor(width))
  height = Math.max(1, Math.floor(height))
  const styleWidth = `${width}px`
  const styleHeight = `${height}px`
  canvas.style.maxWidth = 'none'
  canvas.style.maxHeight = 'none'
  canvas.style.aspectRatio = resolutionPolicy === 'stretch'
    || resolutionPolicy === 'fixed-width'
    || resolutionPolicy === 'fixed-height'
    ? 'auto'
    : `${logicalWidth} / ${logicalHeight}`
  if (canvas.style.width !== styleWidth) canvas.style.width = styleWidth
  if (canvas.style.height !== styleHeight) canvas.style.height = styleHeight
}

export function getViewportMetrics(): [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
] {
  if (!canvas) {
    return [
      logicalWidth, logicalHeight, logicalWidth, logicalHeight,
      0, 0, logicalWidth, logicalHeight,
      0, 0, logicalWidth, logicalHeight,
    ]
  }

  const rect = canvas.getBoundingClientRect()
  const [safeTop, safeRight, safeBottom, safeLeft] = safeAreaInsets()
  const safeScreenLeft = Math.max(rect.left, safeLeft)
  const safeScreenTop = Math.max(rect.top, safeTop)
  const safeScreenRight = Math.min(rect.right, window.innerWidth - safeRight)
  const safeScreenBottom = Math.min(
    rect.bottom,
    window.innerHeight - safeBottom,
  )
  const scaleX = rect.width / logicalWidth
  const scaleY = rect.height / logicalHeight
  const safeX = Math.max(0, (safeScreenLeft - rect.left) / scaleX)
  const safeY = Math.max(0, (safeScreenTop - rect.top) / scaleY)
  const safeWidth = Math.max(0, (safeScreenRight - safeScreenLeft) / scaleX)
  const safeHeight = Math.max(0, (safeScreenBottom - safeScreenTop) / scaleY)

  return [
    logicalWidth,
    logicalHeight,
    window.innerWidth,
    window.innerHeight,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    safeX,
    safeY,
    safeWidth,
    safeHeight,
  ]
}

export function getWinSize(): Size {
  if (!canvas) return { width: logicalWidth, height: logicalHeight }
  resizeDrawingBuffer()
  return { width: canvas.width, height: canvas.height }
}

function orientationValue(): number {
  const type = screen.orientation?.type
  if (type === 'landscape-primary') return 1
  if (type === 'landscape-secondary') return 2
  if (type === 'portrait-primary') return 3
  if (type === 'portrait-secondary') return 4
  return window.innerWidth >= window.innerHeight ? 1 : 3
}

function emitOrientation(): void {
  orientationCallback?.(orientationValue(), logicalWidth, logicalHeight)
}

const TARGET_FPS = 60
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS

function frame(time: number): void {
  if (!running) return
  requestAnimationFrame(frame)

  const elapsed = lastFrameTime === 0 ? FRAME_INTERVAL_MS : time - lastFrameTime
  if (lastFrameTime !== 0 && elapsed < FRAME_INTERVAL_MS - 1.5) {
    return
  }

  resizeDrawingBuffer()
  const dt = lastFrameTime === 0 ? 1 / TARGET_FPS : Math.min(elapsed / 1000, 0.1)
  lastFrameTime = time
  updateCallback?.(dt)
  frameDrawCalls = 0
  frameVertices = 0
  renderCallback?.()
  rendererStats.fps = dt > 0 ? 1 / dt : TARGET_FPS
  rendererStats.frameTimeMs = dt * 1000
  rendererStats.drawCalls = frameDrawCalls
  rendererStats.vertices = frameVertices
}

function startLoop(): void {
  if (running) return
  running = true
  initCallback?.()
  requestAnimationFrame(frame)
}

export function createWindow(
  title: string,
  width: number,
  height: number,
  policy: ResolutionPolicy = 'letterbox',
  canvasId: string = 'sdl-canvas',
): void {
  document.title = title
  designedLogicalWidth = width
  designedLogicalHeight = height
  logicalWidth = designedLogicalWidth
  logicalHeight = designedLogicalHeight
  resolutionPolicy = policy

  canvas = document.getElementById(canvasId) as HTMLCanvasElement
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.id = canvasId
    document.body.appendChild(canvas)
  }
  canvas.width = width
  canvas.height = height
  fitCanvasToViewport()
  canvas.style.touchAction = 'none'

  gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: true,
  })
  if (!gl) throw new Error('WebGL is not supported by this browser')

  program = createProgram()
  batchVbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, batchVbo)
  gl.bufferData(gl.ARRAY_BUFFER, MAX_BATCH_VERTICES * VERTEX_STRIDE_BYTES, gl.DYNAMIC_DRAW)
  positionLocation = gl.getAttribLocation(program, 'a_position')
  uvLocation = gl.getAttribLocation(program, 'a_uv')
  colorLocation = gl.getAttribLocation(program, 'a_color')
  resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  samplerLocation = gl.getUniformLocation(program, 'u_texture')
  whiteTexture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, whiteTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]),
  )
  whiteTextureAsset = {
    texture: whiteTexture,
    width: 1,
    height: 1,
    refs: 1,
    key: '__white',
  }
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.viewport(0, 0, width, height)
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    resizeDrawingBuffer()
    emitOrientation()
  })
  resizeObserver.observe(canvas)

  canvas.addEventListener('pointerdown', (event) => {
    pointerDown = true
    event.preventDefault()
    canvas?.setPointerCapture(event.pointerId)
    touchStartCallback?.(...pointerPosition(event))
  })
  canvas.addEventListener('pointermove', (event) => {
    if (pointerDown) touchMoveCallback?.(...pointerPosition(event))
  })
  const endPointer = (event: PointerEvent) => {
    if (!pointerDown) return
    pointerDown = false
    touchEndCallback?.(...pointerPosition(event))
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)
  window.addEventListener('resize', () => {
    resizeDrawingBuffer()
    emitOrientation()
  })
}

export function loadTexture(path: string, pma = false): number {
  const cacheKey = pma ? `${path}\0pma` : path
  const existingId = textureIds.get(cacheKey)
  if (existingId !== undefined) {
    const existing = textures.get(existingId)
    if (existing) existing.refs++
    return existingId
  }

  const id = nextTextureId++
  const asset: TextureAsset = {
    texture: null,
    width: 0,
    height: 0,
    refs: 1,
    key: cacheKey,
    pma,
  }
  textures.set(id, asset)
  textureIds.set(cacheKey, id)

  const image = new Image()
  image.decoding = 'async'
  image.onload = () => {
    if (textures.get(id) === asset) {
      uploadSource(asset, image, image.naturalWidth, image.naturalHeight, pma)
    }
  }
  image.onerror = () => console.error(`Failed to load texture: ${path}`)
  image.src = assetUrl(path)
  return id
}

export function loadTextFile(_path: string): string | null {
  throw new Error('loadTextFile is only available in the native SDL runtime.')
}

export function loadBinaryFile(_path: string): ArrayBuffer | null {
  throw new Error('loadBinaryFile is only available in the native SDL runtime.')
}

export function loadFont(path: string, ptsize: number): number {
  const key = `${path}\0${ptsize}`
  const existingId = fontIds.get(key)
  if (existingId !== undefined) {
    const existing = fonts.get(existingId)
    if (existing) existing.refs++
    return existingId
  }

  const id = nextFontId++
  const family = `sdl-font-${id}`
  const asset = { family, path, size: ptsize, refs: 1, loaded: false }
  fonts.set(id, asset)
  fontIds.set(key, id)
  const face = new FontFace(family, `url("${assetUrl(path)}")`)
  face.load()
    .then((loaded) => {
      document.fonts.add(loaded)
      asset.loaded = true
      rerenderTextTexturesForFont(id)
    })
    .catch(() => console.error(`Failed to load font: ${path}`))
  return id
}

function renderTextSurface(font: FontAsset, text: string): HTMLCanvasElement | null {
  const surface = document.createElement('canvas')
  const context = surface.getContext('2d')
  if (!context) return null

  context.font = `${font.size}px "${font.family}", sans-serif`
  const metrics = context.measureText(text)
  const ascent = metrics.fontBoundingBoxAscent
    ?? metrics.actualBoundingBoxAscent
    ?? font.size * 0.8
  const descent = metrics.fontBoundingBoxDescent
    ?? metrics.actualBoundingBoxDescent
    ?? font.size * 0.2
  const width = Math.max(1, Math.ceil(metrics.width))
  const height = Math.max(1, Math.ceil(ascent + descent))

  surface.width = width
  surface.height = height
  context.font = `${font.size}px "${font.family}", sans-serif`
  context.fillStyle = 'rgb(220, 220, 220)'
  context.textBaseline = 'alphabetic'
  context.fillText(text, 0, Math.ceil(ascent))
  return surface
}

function rerenderTextTexture(asset: TextureAsset): void {
  const fontId = asset.textFontId
  const text = asset.text
  if (fontId === undefined || text === undefined) return
  const font = fonts.get(fontId)
  if (!font) return
  const surface = renderTextSurface(font, text)
  if (!surface) return
  uploadSource(asset, surface, surface.width, surface.height)
}

function rerenderTextTexturesForFont(fontId: number): void {
  for (const asset of textures.values()) {
    if (asset.textFontId === fontId) rerenderTextTexture(asset)
  }
}

export function loadTextTexture(fontId: number, text: string): number {
  const font = fonts.get(fontId)
  if (!font) return -1
  const key = `text:${fontId}:${text}`
  const existingId = textureIds.get(key)
  if (existingId !== undefined) {
    const existing = textures.get(existingId)
    if (existing) existing.refs++
    return existingId
  }

  const surface = renderTextSurface(font, text)
  if (!surface) return -1

  const id = nextTextureId++
  const asset: TextureAsset = {
    texture: null,
    width: surface.width,
    height: surface.height,
    refs: 1,
    key,
    textFontId: fontId,
    text,
  }
  textures.set(id, asset)
  textureIds.set(key, id)
  uploadSource(asset, surface, surface.width, surface.height)
  return id
}

export function createDynamicTexture(width: number, height: number, source?: TexImageSource): number {
  const id = nextTextureId++
  const key = `dynamic:${id}`
  const asset: TextureAsset = {
    texture: null,
    width,
    height,
    refs: 1,
    key,
  }
  textures.set(id, asset)
  textureIds.set(key, id)
  if (source) {
    try {
      uploadSource(asset, source, width, height)
    } catch {
      // Ignored in headless/uninitialized gl environments
    }
  }
  return id
}

export function updateDynamicTexture(id: number, source: TexImageSource, width?: number, height?: number): void {
  const asset = textures.get(id)
  if (!asset) return
  try {
    uploadSource(asset, source, width ?? asset.width, height ?? asset.height)
  } catch {
    // Ignored in headless/uninitialized gl environments
  }
}

export function releaseTexture(id: number): void {
  const asset = textures.get(id)
  if (!asset || --asset.refs > 0) return
  if (asset.texture === batchTexture) flushDrawBatch()
  if (asset.texture && gl) gl.deleteTexture(asset.texture)
  textures.delete(id)
  textureIds.delete(asset.key)
}

export function releaseFont(id: number): void {
  const asset = fonts.get(id)
  if (!asset || --asset.refs > 0) return
  fonts.delete(id)
  fontIds.delete(`${asset.path}\0${asset.size}`)
}

export function getTextureWidth(id: number): number {
  return textures.get(id)?.width ?? 0
}

export function getTextureHeight(id: number): number {
  return textures.get(id)?.height ?? 0
}

export function clear(): void {
  flushDrawBatch()
  const context = requireGl()
  context.clearColor(9 / 255, 15 / 255, 29 / 255, 1)
  context.clear(context.COLOR_BUFFER_BIT)
}

function drawAsset(
  asset: TextureAsset,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  centerX: number,
  centerY: number,
  flipX: boolean,
  flipY: boolean,
  red = 255,
  green = 255,
  blue = 255,
  alpha = 255,
  additive = false,
): void {
  if (!asset.texture || !program || !batchVbo) return

  if (!sameBatch(asset.texture, additive)
    || batchVertexCount + 6 > MAX_BATCH_VERTICES) {
    flushDrawBatch()
  }

  batchTexture = asset.texture
  batchAdditive = additive

  let u0 = sx / asset.width
  let v0 = sy / asset.height
  let u1 = (sx + sw) / asset.width
  let v1 = (sy + sh) / asset.height
  if (flipX) {
    const tmp = u0
    u0 = u1
    u1 = tmp
  }
  if (flipY) {
    const tmp = v0
    v0 = v1
    v1 = tmp
  }

  let x0 = 0
  let y0 = 0
  let x1 = 0
  let y1 = 0
  let x2 = 0
  let y2 = 0
  let x3 = 0
  let y3 = 0

  if (angle === 0) {
    x0 = x
    y0 = y
    x1 = x + width
    y1 = y
    x2 = x
    y2 = y + height
    x3 = x + width
    y3 = y + height
  } else {
    const radians = angle * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)

    const cx = x + centerX
    const cy = y + centerY

    const lx0 = -centerX
    const ly0 = -centerY
    const lx1 = width - centerX
    const ly1 = -centerY
    const lx2 = -centerX
    const ly2 = height - centerY
    const lx3 = width - centerX
    const ly3 = height - centerY

    x0 = cx + lx0 * cosine - ly0 * sine
    y0 = cy + lx0 * sine + ly0 * cosine
    x1 = cx + lx1 * cosine - ly1 * sine
    y1 = cy + lx1 * sine + ly1 * cosine
    x2 = cx + lx2 * cosine - ly2 * sine
    y2 = cy + lx2 * sine + ly2 * cosine
    x3 = cx + lx3 * cosine - ly3 * sine
    y3 = cy + lx3 * sine + ly3 * cosine
  }

  const packedColor = packColor(red, green, blue, alpha)
  const offset = batchVertexCount * VERTEX_STRIDE_FLOATS

  // v0 (top-left)
  batchFloatView[offset] = x0
  batchFloatView[offset + 1] = y0
  batchFloatView[offset + 2] = u0
  batchFloatView[offset + 3] = v0
  batchUint32View[offset + 4] = packedColor

  // v1 (top-right)
  batchFloatView[offset + 5] = x1
  batchFloatView[offset + 6] = y1
  batchFloatView[offset + 7] = u1
  batchFloatView[offset + 8] = v0
  batchUint32View[offset + 9] = packedColor

  // v2 (bottom-left)
  batchFloatView[offset + 10] = x2
  batchFloatView[offset + 11] = y2
  batchFloatView[offset + 12] = u0
  batchFloatView[offset + 13] = v1
  batchUint32View[offset + 14] = packedColor

  // v3 (= bottom-left)
  batchFloatView[offset + 15] = x2
  batchFloatView[offset + 16] = y2
  batchFloatView[offset + 17] = u0
  batchFloatView[offset + 18] = v1
  batchUint32View[offset + 19] = packedColor

  // v4 (= top-right)
  batchFloatView[offset + 20] = x1
  batchFloatView[offset + 21] = y1
  batchFloatView[offset + 22] = u1
  batchFloatView[offset + 23] = v0
  batchUint32View[offset + 24] = packedColor

  // v5 (bottom-right)
  batchFloatView[offset + 25] = x3
  batchFloatView[offset + 26] = y3
  batchFloatView[offset + 27] = u1
  batchFloatView[offset + 28] = v1
  batchUint32View[offset + 29] = packedColor

  batchVertexCount += 6
  frameVertices += 6
}

function draw(
  id: number,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  centerX: number,
  centerY: number,
  flipX: boolean,
  flipY: boolean,
  red = 255,
  green = 255,
  blue = 255,
  alpha = 255,
  additive = false,
): void {
  const asset = textures.get(id)
  if (!asset) return
  drawAsset(
    asset,
    sx, sy, sw, sh,
    x, y, width, height,
    angle, centerX, centerY,
    flipX, flipY,
    red, green, blue, alpha,
    additive,
  )
}

export function drawTexture(id: number, x: number, y: number): void {
  const asset = textures.get(id)
  if (!asset) return
  draw(id, 0, 0, asset.width, asset.height, x, y, 64, 64, 0, 0, 0, false, false)
}

export function drawTextureRotated(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  centerX: number,
  centerY: number,
  flipX: boolean,
  flipY: boolean,
  red = 255,
  green = 255,
  blue = 255,
  alpha = 255,
  additive = false,
): void {
  const asset = textures.get(id)
  if (!asset) return
  draw(
    id, 0, 0, asset.width, asset.height,
    x, y, width, height, angle, centerX, centerY, flipX, flipY,
    red, green, blue, alpha, additive,
  )
}

export function drawTextureRegionRotated(
  id: number,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  centerX: number,
  centerY: number,
  flipX: boolean,
  flipY: boolean,
  red = 255,
  green = 255,
  blue = 255,
  alpha = 255,
  additive = false,
): void {
  draw(
    id, sourceX, sourceY, sourceWidth, sourceHeight,
    x, y, width, height, angle, centerX, centerY, flipX, flipY,
    red, green, blue, alpha, additive,
  )
}

export function drawTextureQuad(
  id: number,
  x0: number,
  y0: number,
  u0: number,
  v0: number,
  x1: number,
  y1: number,
  u1: number,
  v1: number,
  x2: number,
  y2: number,
  u2: number,
  v2: number,
  x3: number,
  y3: number,
  u3: number,
  v3: number,
  red = 255,
  green = 255,
  blue = 255,
  alpha = 255,
  additive = false,
): void {
  const asset = textures.get(id)
  if (!asset?.texture || !program || !batchVbo) return

  if (!sameBatch(asset.texture, additive)
    || batchVertexCount + 6 > MAX_BATCH_VERTICES) {
    flushDrawBatch()
  }

  batchTexture = asset.texture
  batchAdditive = additive

  const packedColor = packColor(red, green, blue, alpha)
  const offset = batchVertexCount * VERTEX_STRIDE_FLOATS

  // v0 (tri 1: 0, 1, 2)
  batchFloatView[offset] = x0
  batchFloatView[offset + 1] = y0
  batchFloatView[offset + 2] = u0
  batchFloatView[offset + 3] = v0
  batchUint32View[offset + 4] = packedColor

  // v1
  batchFloatView[offset + 5] = x1
  batchFloatView[offset + 6] = y1
  batchFloatView[offset + 7] = u1
  batchFloatView[offset + 8] = v1
  batchUint32View[offset + 9] = packedColor

  // v2
  batchFloatView[offset + 10] = x2
  batchFloatView[offset + 11] = y2
  batchFloatView[offset + 12] = u2
  batchFloatView[offset + 13] = v2
  batchUint32View[offset + 14] = packedColor

  // v3 (= v2) (tri 2: 2, 1, 3)
  batchFloatView[offset + 15] = x2
  batchFloatView[offset + 16] = y2
  batchFloatView[offset + 17] = u2
  batchFloatView[offset + 18] = v2
  batchUint32View[offset + 19] = packedColor

  // v4 (= v1)
  batchFloatView[offset + 20] = x1
  batchFloatView[offset + 21] = y1
  batchFloatView[offset + 22] = u1
  batchFloatView[offset + 23] = v1
  batchUint32View[offset + 24] = packedColor

  // v5 (= v3)
  batchFloatView[offset + 25] = x3
  batchFloatView[offset + 26] = y3
  batchFloatView[offset + 27] = u3
  batchFloatView[offset + 28] = v3
  batchUint32View[offset + 29] = packedColor

  batchVertexCount += 6
  frameVertices += 6
}

export function drawTextureMesh(
  id: number,
  positions: Float32Array,
  uvs: Float32Array,
  indices: Uint16Array,
  red = 255,
  green = 255,
  blue = 255,
  alpha = 255,
  translateX = 0,
  translateY = 0,
  scaleX = 1,
  scaleY = 1,
  cosine = 1,
  sine = 0,
  additive = false,
): void {
  const asset = textures.get(id)
  if (!asset?.texture || !program || !batchVbo || positions.length !== uvs.length || indices.length % 3 !== 0) return

  const numVertices = indices.length
  if (!sameBatch(asset.texture, additive)
    || batchVertexCount + numVertices > MAX_BATCH_VERTICES) {
    flushDrawBatch()
  }

  batchTexture = asset.texture
  batchAdditive = additive

  const packedColor = packColor(red, green, blue, alpha)

  for (let i = 0; i < indices.length; i++) {
    if (batchVertexCount >= MAX_BATCH_VERTICES) {
      flushDrawBatch()
      batchTexture = asset.texture
      batchAdditive = additive
    }
    const index = indices[i] * 2
    if (index + 1 >= positions.length) return
    const x = positions[index] * scaleX
    const y = positions[index + 1] * scaleY
    const vx = translateX + x * cosine - y * sine
    const vy = translateY + x * sine + y * cosine
    const vu = uvs[index]
    const vv = uvs[index + 1]

    const offset = batchVertexCount * VERTEX_STRIDE_FLOATS
    batchFloatView[offset] = vx
    batchFloatView[offset + 1] = vy
    batchFloatView[offset + 2] = vu
    batchFloatView[offset + 3] = vv
    batchUint32View[offset + 4] = packedColor
    batchVertexCount++
  }
  frameVertices += numVertices
}

export function drawRect(
  x: number,
  y: number,
  width: number,
  height: number,
  red: number,
  green: number,
  blue: number,
  alpha = 255,
): void {
  if (!whiteTextureAsset || !program || !batchVbo) return
  drawAsset(
    whiteTextureAsset,
    0, 0, 1, 1,
    x, y, width, height,
    0, 0, 0,
    false, false,
    red, green, blue, alpha,
    false,
  )
}

export function drawLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  red: number,
  green: number,
  blue: number,
  alpha = 255,
): void {
  const length = Math.hypot(x2 - x1, y2 - y1)
  if (length <= 0 || !whiteTextureAsset || !program || !batchVbo) return
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
  drawAsset(
    whiteTextureAsset,
    0, 0, 1, 1,
    x1, y1 - 0.5,
    length, 1,
    angle, 0, 0,
    false, false,
    red, green, blue, alpha,
    false,
  )
}

export function drawPoint(
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha = 255,
): void {
  drawRect(x - 1, y - 1, 2, 2, red, green, blue, alpha)
}

export function drawCircle(
  x: number,
  y: number,
  radius: number,
  red: number,
  green: number,
  blue: number,
  alpha = 255,
  fill = false,
): void {
  const segments = Math.max(12, Math.ceil(radius / 2))
  let previous = { x: x + radius, y }
  for (let i = 1; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2
    const current = {
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius,
    }
    drawLine(previous.x, previous.y, current.x, current.y, red, green, blue, alpha)
    if (fill) drawLine(x, y, current.x, current.y, red, green, blue, alpha * 0.35)
    previous = current
  }
}

export function drawPolyline(
  points: Point[],
  red: number,
  green: number,
  blue: number,
  alpha = 255,
  closed = false,
): void {
  for (let i = 1; i < points.length; i++) {
    drawLine(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, red, green, blue, alpha)
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1]
    const first = points[0]
    drawLine(last.x, last.y, first.x, first.y, red, green, blue, alpha)
  }
}

export function pushClipRect(
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const previous = clipStack[clipStack.length - 1]
  if (previous) {
    const right = Math.min(x + width, previous[0] + previous[2])
    const bottom = Math.min(y + height, previous[1] + previous[3])
    x = Math.max(x, previous[0])
    y = Math.max(y, previous[1])
    width = Math.max(0, right - x)
    height = Math.max(0, bottom - y)
  }
  clipStack.push([x, y, width, height])
  applyClipRect()
}

export interface SpriteBatchBuffer {
  commands: Int32Array
  floatBuffer: Float32Array
  uintBuffer: Uint32Array
  shortBuffer?: Uint16Array
}

export function submitCommandBuffer(buffer: SpriteBatchBuffer): void {
  const { commands, floatBuffer, uintBuffer, shortBuffer } = buffer
  let cmdIdx = 0
  let floatIdx = 0
  let uintIdx = 0
  let shortIdx = 0

  const numCmds = commands.length

  let cachedId = -1
  let cachedAsset: TextureAsset | null = null

  while (cmdIdx < numCmds) {
    const op = commands[cmdIdx++]
    if (op === 0) break

    if (op === 1) { // CMD_DRAW_SPRITE
      const texture = uintBuffer[uintIdx++]
      const additive = (texture & 0x80000000) !== 0
      const id = texture & 0x7fffffff
      const c = uintBuffer[uintIdx++]
      const x = floatBuffer[floatIdx++]
      const y = floatBuffer[floatIdx++]
      const w = floatBuffer[floatIdx++]
      const h = floatBuffer[floatIdx++]
      const angle = floatBuffer[floatIdx++]
      const cx = floatBuffer[floatIdx++]
      const cy = floatBuffer[floatIdx++]
      const flipX = floatBuffer[floatIdx++] !== 0
      const flipY = floatBuffer[floatIdx++] !== 0

      if (id !== cachedId) {
        cachedId = id
        cachedAsset = textures.get(id) ?? null
      }
      if (!cachedAsset?.texture || !program || !batchVbo) continue

      if (!sameBatch(cachedAsset.texture, additive) || batchVertexCount + 6 > MAX_BATCH_VERTICES) {
        flushDrawBatch()
      }

      batchTexture = cachedAsset.texture
      batchAdditive = additive

      let u0 = 0
      let v0 = 0
      let u1 = 1
      let v1 = 1
      if (flipX) { u0 = 1; u1 = 0 }
      if (flipY) { v0 = 1; v1 = 0 }

      let x0 = 0
      let y0 = 0
      let x1 = 0
      let y1 = 0
      let x2 = 0
      let y2 = 0
      let x3 = 0
      let y3 = 0
      if (angle === 0) {
        x0 = x
        y0 = y
        x1 = x + w
        y1 = y
        x2 = x
        y2 = y + h
        x3 = x + w
        y3 = y + h
      } else {
        const radians = angle * Math.PI / 180
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        const originX = x + cx
        const originY = y + cy
        const lx0 = -cx
        const ly0 = -cy
        const lx1 = w - cx
        const ly1 = -cy
        const lx2 = -cx
        const ly2 = h - cy
        const lx3 = w - cx
        const ly3 = h - cy
        x0 = originX + lx0 * cos - ly0 * sin
        y0 = originY + lx0 * sin + ly0 * cos
        x1 = originX + lx1 * cos - ly1 * sin
        y1 = originY + lx1 * sin + ly1 * cos
        x2 = originX + lx2 * cos - ly2 * sin
        y2 = originY + lx2 * sin + ly2 * cos
        x3 = originX + lx3 * cos - ly3 * sin
        y3 = originY + lx3 * sin + ly3 * cos
      }

      const packedColor = ((c << 24) | ((c & 0xff00) << 8) | ((c >> 8) & 0xff00) | (c >>> 24)) >>> 0
      const offset = batchVertexCount * VERTEX_STRIDE_FLOATS

      batchFloatView[offset] = x0; batchFloatView[offset + 1] = y0; batchFloatView[offset + 2] = u0; batchFloatView[offset + 3] = v0; batchUint32View[offset + 4] = packedColor
      batchFloatView[offset + 5] = x1; batchFloatView[offset + 6] = y1; batchFloatView[offset + 7] = u1; batchFloatView[offset + 8] = v0; batchUint32View[offset + 9] = packedColor
      batchFloatView[offset + 10] = x2; batchFloatView[offset + 11] = y2; batchFloatView[offset + 12] = u0; batchFloatView[offset + 13] = v1; batchUint32View[offset + 14] = packedColor
      batchFloatView[offset + 15] = x2; batchFloatView[offset + 16] = y2; batchFloatView[offset + 17] = u0; batchFloatView[offset + 18] = v1; batchUint32View[offset + 19] = packedColor
      batchFloatView[offset + 20] = x1; batchFloatView[offset + 21] = y1; batchFloatView[offset + 22] = u1; batchFloatView[offset + 23] = v0; batchUint32View[offset + 24] = packedColor
      batchFloatView[offset + 25] = x3; batchFloatView[offset + 26] = y3; batchFloatView[offset + 27] = u1; batchFloatView[offset + 28] = v1; batchUint32View[offset + 29] = packedColor

      batchVertexCount += 6
      frameVertices += 6
    } else if (op === 8) { // CMD_DRAW_REGION
      const texture = uintBuffer[uintIdx++]
      const additive = (texture & 0x80000000) !== 0
      const id = texture & 0x7fffffff
      const c = uintBuffer[uintIdx++]
      const sx = floatBuffer[floatIdx++]
      const sy = floatBuffer[floatIdx++]
      const sw = floatBuffer[floatIdx++]
      const sh = floatBuffer[floatIdx++]
      const dx = floatBuffer[floatIdx++]
      const dy = floatBuffer[floatIdx++]
      const dw = floatBuffer[floatIdx++]
      const dh = floatBuffer[floatIdx++]
      const angle = floatBuffer[floatIdx++]
      const cx = floatBuffer[floatIdx++]
      const cy = floatBuffer[floatIdx++]
      const flipX = floatBuffer[floatIdx++] !== 0
      const flipY = floatBuffer[floatIdx++] !== 0

      if (id !== cachedId) {
        cachedId = id
        cachedAsset = textures.get(id) ?? null
      }
      if (!cachedAsset?.texture || !program || !batchVbo) continue

      if (!sameBatch(cachedAsset.texture, additive) || batchVertexCount + 6 > MAX_BATCH_VERTICES) {
        flushDrawBatch()
      }

      batchTexture = cachedAsset.texture
      batchAdditive = additive

      let u0 = sx / cachedAsset.width
      let v0 = sy / cachedAsset.height
      let u1 = (sx + sw) / cachedAsset.width
      let v1 = (sy + sh) / cachedAsset.height
      if (flipX) { const tmp = u0; u0 = u1; u1 = tmp }
      if (flipY) { const tmp = v0; v0 = v1; v1 = tmp }

      let x0 = 0
      let y0 = 0
      let x1 = 0
      let y1 = 0
      let x2 = 0
      let y2 = 0
      let x3 = 0
      let y3 = 0
      if (angle === 0) {
        x0 = dx
        y0 = dy
        x1 = dx + dw
        y1 = dy
        x2 = dx
        y2 = dy + dh
        x3 = dx + dw
        y3 = dy + dh
      } else {
        const radians = angle * Math.PI / 180
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        const originX = dx + cx
        const originY = dy + cy
        const lx0 = -cx
        const ly0 = -cy
        const lx1 = dw - cx
        const ly1 = -cy
        const lx2 = -cx
        const ly2 = dh - cy
        const lx3 = dw - cx
        const ly3 = dh - cy
        x0 = originX + lx0 * cos - ly0 * sin
        y0 = originY + lx0 * sin + ly0 * cos
        x1 = originX + lx1 * cos - ly1 * sin
        y1 = originY + lx1 * sin + ly1 * cos
        x2 = originX + lx2 * cos - ly2 * sin
        y2 = originY + lx2 * sin + ly2 * cos
        x3 = originX + lx3 * cos - ly3 * sin
        y3 = originY + lx3 * sin + ly3 * cos
      }

      const packedColor = ((c << 24) | ((c & 0xff00) << 8) | ((c >> 8) & 0xff00) | (c >>> 24)) >>> 0
      const offset = batchVertexCount * VERTEX_STRIDE_FLOATS

      batchFloatView[offset] = x0; batchFloatView[offset + 1] = y0; batchFloatView[offset + 2] = u0; batchFloatView[offset + 3] = v0; batchUint32View[offset + 4] = packedColor
      batchFloatView[offset + 5] = x1; batchFloatView[offset + 6] = y1; batchFloatView[offset + 7] = u1; batchFloatView[offset + 8] = v0; batchUint32View[offset + 9] = packedColor
      batchFloatView[offset + 10] = x2; batchFloatView[offset + 11] = y2; batchFloatView[offset + 12] = u0; batchFloatView[offset + 13] = v1; batchUint32View[offset + 14] = packedColor
      batchFloatView[offset + 15] = x2; batchFloatView[offset + 16] = y2; batchFloatView[offset + 17] = u0; batchFloatView[offset + 18] = v1; batchUint32View[offset + 19] = packedColor
      batchFloatView[offset + 20] = x1; batchFloatView[offset + 21] = y1; batchFloatView[offset + 22] = u1; batchFloatView[offset + 23] = v0; batchUint32View[offset + 24] = packedColor
      batchFloatView[offset + 25] = x3; batchFloatView[offset + 26] = y3; batchFloatView[offset + 27] = u1; batchFloatView[offset + 28] = v1; batchUint32View[offset + 29] = packedColor

      batchVertexCount += 6
      frameVertices += 6
    } else if (op === 2) { // CMD_DRAW_QUAD
      const id = uintBuffer[uintIdx++]
      const c = uintBuffer[uintIdx++]
      const x0 = floatBuffer[floatIdx++], y0 = floatBuffer[floatIdx++]
      const u0 = floatBuffer[floatIdx++], v0 = floatBuffer[floatIdx++]
      const x1 = floatBuffer[floatIdx++], y1 = floatBuffer[floatIdx++]
      const u1 = floatBuffer[floatIdx++], v1 = floatBuffer[floatIdx++]
      const x2 = floatBuffer[floatIdx++], y2 = floatBuffer[floatIdx++]
      const u2 = floatBuffer[floatIdx++], v2 = floatBuffer[floatIdx++]
      const x3 = floatBuffer[floatIdx++], y3 = floatBuffer[floatIdx++]
      const u3 = floatBuffer[floatIdx++], v3 = floatBuffer[floatIdx++]

      if (id !== cachedId) {
        cachedId = id
        cachedAsset = textures.get(id) ?? null
      }
      if (!cachedAsset?.texture || !program || !batchVbo) continue

      if (!sameBatch(cachedAsset.texture, false) || batchVertexCount + 6 > MAX_BATCH_VERTICES) {
        flushDrawBatch()
      }

      batchTexture = cachedAsset.texture
      batchAdditive = false

      const packedColor = ((c << 24) | ((c & 0xff00) << 8) | ((c >> 8) & 0xff00) | (c >>> 24)) >>> 0
      const offset = batchVertexCount * VERTEX_STRIDE_FLOATS

      batchFloatView[offset] = x0; batchFloatView[offset + 1] = y0; batchFloatView[offset + 2] = u0; batchFloatView[offset + 3] = v0; batchUint32View[offset + 4] = packedColor
      batchFloatView[offset + 5] = x1; batchFloatView[offset + 6] = y1; batchFloatView[offset + 7] = u1; batchFloatView[offset + 8] = v1; batchUint32View[offset + 9] = packedColor
      batchFloatView[offset + 10] = x2; batchFloatView[offset + 11] = y2; batchFloatView[offset + 12] = u2; batchFloatView[offset + 13] = v2; batchUint32View[offset + 14] = packedColor
      batchFloatView[offset + 15] = x2; batchFloatView[offset + 16] = y2; batchFloatView[offset + 17] = u2; batchFloatView[offset + 18] = v2; batchUint32View[offset + 19] = packedColor
      batchFloatView[offset + 20] = x1; batchFloatView[offset + 21] = y1; batchFloatView[offset + 22] = u1; batchFloatView[offset + 23] = v1; batchUint32View[offset + 24] = packedColor
      batchFloatView[offset + 25] = x3; batchFloatView[offset + 26] = y3; batchFloatView[offset + 27] = u3; batchFloatView[offset + 28] = v3; batchUint32View[offset + 29] = packedColor

      batchVertexCount += 6
      frameVertices += 6
    } else if (op === 3) { // CMD_DRAW_MESH
      const id = uintBuffer[uintIdx++]
      const c = uintBuffer[uintIdx++]
      const vCount = uintBuffer[uintIdx++]
      const iCount = uintBuffer[uintIdx++]

      const posOffset = floatIdx
      floatIdx += vCount * 2
      const uvOffset = floatIdx
      floatIdx += vCount * 2

      const tx = floatBuffer[floatIdx++]
      const ty = floatBuffer[floatIdx++]
      const sx = floatBuffer[floatIdx++]
      const sy = floatBuffer[floatIdx++]
      const cos = floatBuffer[floatIdx++]
      const sin = floatBuffer[floatIdx++]

      const indOffset = shortIdx
      shortIdx += iCount

      if (id !== cachedId) {
        cachedId = id
        cachedAsset = textures.get(id) ?? null
      }
      if (!cachedAsset?.texture || !program || !batchVbo || !shortBuffer || iCount % 3 !== 0) continue

      if (!sameBatch(cachedAsset.texture, false) || batchVertexCount + iCount > MAX_BATCH_VERTICES) {
        flushDrawBatch()
      }

      batchTexture = cachedAsset.texture
      batchAdditive = false

      const packedColor = ((c << 24) | ((c & 0xff00) << 8) | ((c >> 8) & 0xff00) | (c >>> 24)) >>> 0

      for (let i = 0; i < iCount; i++) {
        if (batchVertexCount >= MAX_BATCH_VERTICES) {
          flushDrawBatch()
          batchTexture = cachedAsset.texture
          batchAdditive = false
        }
        const vertIndex = shortBuffer[indOffset + i] * 2
        const px = floatBuffer[posOffset + vertIndex] * sx
        const py = floatBuffer[posOffset + vertIndex + 1] * sy
        const vx = tx + px * cos - py * sin
        const vy = ty + px * sin + py * cos
        const vu = floatBuffer[uvOffset + vertIndex]
        const vv = floatBuffer[uvOffset + vertIndex + 1]

        const offset = batchVertexCount * VERTEX_STRIDE_FLOATS
        batchFloatView[offset] = vx
        batchFloatView[offset + 1] = vy
        batchFloatView[offset + 2] = vu
        batchFloatView[offset + 3] = vv
        batchUint32View[offset + 4] = packedColor
        batchVertexCount++
      }
      frameVertices += iCount
    } else if (op === 4) { // CMD_DRAW_RECT
      const c = uintBuffer[uintIdx++]
      const x = floatBuffer[floatIdx++]
      const y = floatBuffer[floatIdx++]
      const w = floatBuffer[floatIdx++]
      const h = floatBuffer[floatIdx++]

      if (!whiteTextureAsset || !program || !batchVbo) continue

      if (!sameBatch(whiteTextureAsset.texture, false) || batchVertexCount + 6 > MAX_BATCH_VERTICES) {
        flushDrawBatch()
      }

      batchTexture = whiteTextureAsset.texture
      batchAdditive = false

      const packedColor = ((c << 24) | ((c & 0xff00) << 8) | ((c >> 8) & 0xff00) | (c >>> 24)) >>> 0
      const offset = batchVertexCount * VERTEX_STRIDE_FLOATS

      batchFloatView[offset] = x; batchFloatView[offset + 1] = y; batchFloatView[offset + 2] = 0; batchFloatView[offset + 3] = 0; batchUint32View[offset + 4] = packedColor
      batchFloatView[offset + 5] = x + w; batchFloatView[offset + 6] = y; batchFloatView[offset + 7] = 1; batchFloatView[offset + 8] = 0; batchUint32View[offset + 9] = packedColor
      batchFloatView[offset + 10] = x; batchFloatView[offset + 11] = y + h; batchFloatView[offset + 12] = 0; batchFloatView[offset + 13] = 1; batchUint32View[offset + 14] = packedColor
      batchFloatView[offset + 15] = x; batchFloatView[offset + 16] = y + h; batchFloatView[offset + 17] = 0; batchFloatView[offset + 18] = 1; batchUint32View[offset + 19] = packedColor
      batchFloatView[offset + 20] = x + w; batchFloatView[offset + 21] = y; batchFloatView[offset + 22] = 1; batchFloatView[offset + 23] = 0; batchUint32View[offset + 24] = packedColor
      batchFloatView[offset + 25] = x + w; batchFloatView[offset + 26] = y + h; batchFloatView[offset + 27] = 1; batchFloatView[offset + 28] = 1; batchUint32View[offset + 29] = packedColor

      batchVertexCount += 6
      frameVertices += 6
    } else if (op === 5) { // CMD_DRAW_LINE
      const c = uintBuffer[uintIdx++]
      const x1 = floatBuffer[floatIdx++]
      const y1 = floatBuffer[floatIdx++]
      const x2 = floatBuffer[floatIdx++]
      const y2 = floatBuffer[floatIdx++]

      if (!whiteTextureAsset || !program || !batchVbo) continue

      const length = Math.hypot(x2 - x1, y2 - y1)
      if (length <= 0) continue

      if (!sameBatch(whiteTextureAsset.texture, false) || batchVertexCount + 6 > MAX_BATCH_VERTICES) {
        flushDrawBatch()
      }

      batchTexture = whiteTextureAsset.texture
      batchAdditive = false

      const angle = Math.atan2(y2 - y1, x2 - x1)
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      const lx0 = 0, ly0 = -0.5
      const lx1 = length, ly1 = -0.5
      const lx2 = 0, ly2 = 0.5
      const lx3 = length, ly3 = 0.5

      const x0 = x1 + lx0 * cos - ly0 * sin
      const y0 = y1 + lx0 * sin + ly0 * cos
      const x1_ = x1 + lx1 * cos - ly1 * sin
      const y1_ = y1 + lx1 * sin + ly1 * cos
      const x2_ = x1 + lx2 * cos - ly2 * sin
      const y2_ = y1 + lx2 * sin + ly2 * cos
      const x3_ = x1 + lx3 * cos - ly3 * sin
      const y3_ = y1 + lx3 * sin + ly3 * cos

      const packedColor = ((c << 24) | ((c & 0xff00) << 8) | ((c >> 8) & 0xff00) | (c >>> 24)) >>> 0
      const offset = batchVertexCount * VERTEX_STRIDE_FLOATS

      batchFloatView[offset] = x0; batchFloatView[offset + 1] = y0; batchFloatView[offset + 2] = 0; batchFloatView[offset + 3] = 0; batchUint32View[offset + 4] = packedColor
      batchFloatView[offset + 5] = x1_; batchFloatView[offset + 6] = y1_; batchFloatView[offset + 7] = 1; batchFloatView[offset + 8] = 0; batchUint32View[offset + 9] = packedColor
      batchFloatView[offset + 10] = x2_; batchFloatView[offset + 11] = y2_; batchFloatView[offset + 12] = 0; batchFloatView[offset + 13] = 1; batchUint32View[offset + 14] = packedColor
      batchFloatView[offset + 15] = x2_; batchFloatView[offset + 16] = y2_; batchFloatView[offset + 17] = 0; batchFloatView[offset + 18] = 1; batchUint32View[offset + 19] = packedColor
      batchFloatView[offset + 20] = x1_; batchFloatView[offset + 21] = y1_; batchFloatView[offset + 22] = 1; batchFloatView[offset + 23] = 0; batchUint32View[offset + 24] = packedColor
      batchFloatView[offset + 25] = x3_; batchFloatView[offset + 26] = y3_; batchFloatView[offset + 27] = 1; batchFloatView[offset + 28] = 1; batchUint32View[offset + 29] = packedColor

      batchVertexCount += 6
      frameVertices += 6
    } else if (op === 6) { // CMD_PUSH_CLIP
      const x = floatBuffer[floatIdx++]
      const y = floatBuffer[floatIdx++]
      const w = floatBuffer[floatIdx++]
      const h = floatBuffer[floatIdx++]

      pushClipRect(x, y, w, h)
    } else if (op === 7) { // CMD_POP_CLIP
      popClipRect()
    }
  }
}

export function popClipRect(): void {
  clipStack.pop()
  applyClipRect()
}

function applyClipRect(): void {
  flushDrawBatch()
  if (!canvas || !gl) return
  const clip = clipStack[clipStack.length - 1]
  if (!clip) {
    gl.disable(gl.SCISSOR_TEST)
    return
  }
  const scaleX = canvas.width / logicalWidth
  const scaleY = canvas.height / logicalHeight
  gl.enable(gl.SCISSOR_TEST)
  gl.scissor(
    Math.round(clip[0] * scaleX),
    Math.round(canvas.height - (clip[1] + clip[3]) * scaleY),
    Math.max(0, Math.round(clip[2] * scaleX)),
    Math.max(0, Math.round(clip[3] * scaleY)),
  )
}

export function present(): void {
  flushDrawBatch()
  gl?.flush()
}

export function getRendererStats(): RendererStats {
  return { ...rendererStats }
}

export function onInit(callback: VoidCallback): void {
  initCallback = callback
  queueMicrotask(startLoop)
}

export function onUpdate(callback: UpdateCallback): void {
  updateCallback = callback
}

export function onRender(callback: VoidCallback): void {
  renderCallback = callback
}

export function onTouchStart(callback: TouchCallback): void {
  touchStartCallback = callback
}

export function onTouchMove(callback: TouchCallback): void {
  touchMoveCallback = callback
}

export function onTouchEnd(callback: TouchCallback): void {
  touchEndCallback = callback
}

export function onTextInput(callback: TextInputCallback): void {
  textInputCallback = callback
}

export function onKeyDown(callback: KeyCallback): void {
  keyDownCallback = callback
}

export function onKeyUp(callback: KeyCallback): void {
  keyUpCallback = callback
}

export function startTextInput(): void {
  const input = ensureHiddenTextInput()
  input.focus({ preventScroll: true })
  queueMicrotask(() => {
    input.focus({ preventScroll: true })
  })
}

export function stopTextInput(): void {
  hiddenTextInput?.blur()
  if (hiddenTextInput) hiddenTextInput.value = ''
}

export function onPause(callback: VoidCallback): void {
  pauseCallback = callback
}

export function onResume(callback: VoidCallback): void {
  resumeCallback = callback
}

export function onBackground(callback: VoidCallback): void {
  backgroundCallback = callback
}

export function onForeground(callback: VoidCallback): void {
  foregroundCallback = callback
}

export function onInterruption(callback: InterruptionCallback): void {
  interruptionCallback = callback
}

export function onLowMemory(callback: VoidCallback): void {
  lowMemoryCallback = callback
}

export function onOrientationChange(callback: OrientationCallback): void {
  orientationCallback = callback
}

export function onTerminate(callback: VoidCallback): void {
  terminateCallback = callback
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseCallback?.()
      interruptionCallback?.(true)
      backgroundCallback?.()
      lastFrameTime = 0
    } else {
      foregroundCallback?.()
      interruptionCallback?.(false)
      resumeCallback?.()
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('orientationchange', emitOrientation)
  window.addEventListener('pagehide', () => terminateCallback?.())
  window.addEventListener('keydown', (event) => {
    const active = document.activeElement
    if (active && active !== document.body && active !== canvas && active !== hiddenTextInput) {
      return
    }
    keyDownCallback?.(event.key)
    if (active === hiddenTextInput || event.target === hiddenTextInput) {
      if (['Tab', 'Backspace', 'Escape', 'Enter'].includes(event.key)) {
        event.preventDefault()
      }
    }
  })
  window.addEventListener('keyup', (event) => {
    const active = document.activeElement
    if (active && active !== document.body && active !== canvas && active !== hiddenTextInput) {
      return
    }
    keyUpCallback?.(event.key)
  })
}

// Browsers do not expose an equivalent low-memory event.
void lowMemoryCallback
