type VoidCallback = () => void;
type UpdateCallback = (dt: number) => void;
type TouchCallback = (x: number, y: number) => void;
type InterruptionCallback = (active: boolean) => void;
type OrientationCallback = (
  orientation: number,
  width: number,
  height: number,
) => void;

interface TextureAsset {
  texture: WebGLTexture | null;
  width: number;
  height: number;
  refs: number;
  key: string;
}

interface FontAsset {
  family: string;
  path: string;
  size: number;
  refs: number;
}

let canvas: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let positionBuffer: WebGLBuffer | null = null;
let uvBuffer: WebGLBuffer | null = null;
let positionLocation = -1;
let uvLocation = -1;
let resolutionLocation: WebGLUniformLocation | null = null;
let samplerLocation: WebGLUniformLocation | null = null;
let logicalWidth = 1;
let logicalHeight = 1;
let nextTextureId = 0;
let nextFontId = 0;
let running = false;
let lastFrameTime = 0;
let pointerDown = false;
let resizeObserver: ResizeObserver | null = null;

const textures = new Map<number, TextureAsset>();
const textureIds = new Map<string, number>();
const fonts = new Map<number, FontAsset>();
const fontIds = new Map<string, number>();

let initCallback: VoidCallback | null = null;
let updateCallback: UpdateCallback | null = null;
let renderCallback: VoidCallback | null = null;
let touchStartCallback: TouchCallback | null = null;
let touchMoveCallback: TouchCallback | null = null;
let touchEndCallback: TouchCallback | null = null;
let pauseCallback: VoidCallback | null = null;
let resumeCallback: VoidCallback | null = null;
let backgroundCallback: VoidCallback | null = null;
let foregroundCallback: VoidCallback | null = null;
let interruptionCallback: InterruptionCallback | null = null;
let lowMemoryCallback: VoidCallback | null = null;
let orientationCallback: OrientationCallback | null = null;
let terminateCallback: VoidCallback | null = null;

function compileShader(type: number, source: string): WebGLShader {
  const context = requireGl();
  const shader = context.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const message = context.getShaderInfoLog(shader) ?? "Unknown shader error";
    context.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(): WebGLProgram {
  const context = requireGl();
  const vertexShader = compileShader(context.VERTEX_SHADER, `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    uniform vec2 u_resolution;
    varying vec2 v_uv;

    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      v_uv = a_uv;
    }
  `);
  const fragmentShader = compileShader(context.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_texture;
    varying vec2 v_uv;

    void main() {
      gl_FragColor = texture2D(u_texture, v_uv);
    }
  `);
  const result = context.createProgram();
  if (!result) throw new Error("Unable to create WebGL program");
  context.attachShader(result, vertexShader);
  context.attachShader(result, fragmentShader);
  context.linkProgram(result);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);
  if (!context.getProgramParameter(result, context.LINK_STATUS)) {
    throw new Error(context.getProgramInfoLog(result) ?? "WebGL link failed");
  }
  return result;
}

function requireGl(): WebGLRenderingContext {
  if (!gl) throw new Error("createWindow() must be called before rendering");
  return gl;
}

function assetUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.?\//, "");
  const publicPath = normalized.startsWith("res/")
    ? normalized.slice("res/".length)
    : normalized;
  return `${import.meta.env.BASE_URL}${publicPath}`;
}

function uploadSource(
  asset: TextureAsset,
  source: TexImageSource,
  width: number,
  height: number,
): void {
  const context = requireGl();
  const texture = asset.texture ?? context.createTexture();
  if (!texture) throw new Error(`Unable to create texture: ${asset.key}`);
  asset.texture = texture;
  asset.width = width;
  asset.height = height;
  context.bindTexture(context.TEXTURE_2D, texture);
  context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
  context.texImage2D(
    context.TEXTURE_2D,
    0,
    context.RGBA,
    context.RGBA,
    context.UNSIGNED_BYTE,
    source,
  );
}

function pointerPosition(event: PointerEvent): [number, number] {
  if (!canvas) return [0, 0];
  const rect = canvas.getBoundingClientRect();
  return [
    (event.clientX - rect.left) * logicalWidth / rect.width,
    (event.clientY - rect.top) * logicalHeight / rect.height,
  ];
}

function safeAreaInsets(): [number, number, number, number] {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string) =>
    Number.parseFloat(style.getPropertyValue(name)) || 0;
  return [
    value("--safe-area-inset-top"),
    value("--safe-area-inset-right"),
    value("--safe-area-inset-bottom"),
    value("--safe-area-inset-left"),
  ];
}

function resizeDrawingBuffer(): void {
  if (!canvas || !gl) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
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
    ];
  }

  const rect = canvas.getBoundingClientRect();
  const [safeTop, safeRight, safeBottom, safeLeft] = safeAreaInsets();
  const safeScreenLeft = Math.max(rect.left, safeLeft);
  const safeScreenTop = Math.max(rect.top, safeTop);
  const safeScreenRight = Math.min(rect.right, window.innerWidth - safeRight);
  const safeScreenBottom = Math.min(
    rect.bottom,
    window.innerHeight - safeBottom,
  );
  const scale = rect.width / logicalWidth;
  const safeX = Math.max(0, (safeScreenLeft - rect.left) / scale);
  const safeY = Math.max(0, (safeScreenTop - rect.top) / scale);
  const safeWidth = Math.max(0, (safeScreenRight - safeScreenLeft) / scale);
  const safeHeight = Math.max(0, (safeScreenBottom - safeScreenTop) / scale);

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
  ];
}

function orientationValue(): number {
  const type = screen.orientation?.type;
  if (type === "landscape-primary") return 1;
  if (type === "landscape-secondary") return 2;
  if (type === "portrait-primary") return 3;
  if (type === "portrait-secondary") return 4;
  return window.innerWidth >= window.innerHeight ? 1 : 3;
}

function emitOrientation(): void {
  orientationCallback?.(orientationValue(), logicalWidth, logicalHeight);
}

function frame(time: number): void {
  if (!running) return;
  resizeDrawingBuffer();
  const dt = lastFrameTime === 0 ? 0 : Math.min((time - lastFrameTime) / 1000, 0.1);
  lastFrameTime = time;
  updateCallback?.(dt);
  renderCallback?.();
  requestAnimationFrame(frame);
}

function startLoop(): void {
  if (running) return;
  running = true;
  initCallback?.();
  requestAnimationFrame(frame);
}

export function createWindow(title: string, width: number, height: number): void {
  document.title = title;
  logicalWidth = width;
  logicalHeight = height;

  canvas = document.querySelector<HTMLCanvasElement>("#sdl-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "sdl-canvas";
    document.body.appendChild(canvas);
  }
  canvas.width = width;
  canvas.height = height;
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.style.touchAction = "none";

  gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: true,
  });
  if (!gl) throw new Error("WebGL is not supported by this browser");

  program = createProgram();
  positionBuffer = gl.createBuffer();
  uvBuffer = gl.createBuffer();
  positionLocation = gl.getAttribLocation(program, "a_position");
  uvLocation = gl.getAttribLocation(program, "a_uv");
  resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  samplerLocation = gl.getUniformLocation(program, "u_texture");
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, width, height);
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => {
    resizeDrawingBuffer();
    emitOrientation();
  });
  resizeObserver.observe(canvas);

  canvas.addEventListener("pointerdown", (event) => {
    pointerDown = true;
    canvas?.setPointerCapture(event.pointerId);
    touchStartCallback?.(...pointerPosition(event));
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointerDown) touchMoveCallback?.(...pointerPosition(event));
  });
  const endPointer = (event: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    touchEndCallback?.(...pointerPosition(event));
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("resize", emitOrientation);
}

export function loadTexture(path: string): number {
  const existingId = textureIds.get(path);
  if (existingId !== undefined) {
    const existing = textures.get(existingId);
    if (existing) existing.refs++;
    return existingId;
  }

  const id = nextTextureId++;
  const asset: TextureAsset = {
    texture: null,
    width: 0,
    height: 0,
    refs: 1,
    key: path,
  };
  textures.set(id, asset);
  textureIds.set(path, id);

  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    if (textures.get(id) === asset) {
      uploadSource(asset, image, image.naturalWidth, image.naturalHeight);
    }
  };
  image.onerror = () => console.error(`Failed to load texture: ${path}`);
  image.src = assetUrl(path);
  return id;
}

export function loadFont(path: string, ptsize: number): number {
  const key = `${path}\0${ptsize}`;
  const existingId = fontIds.get(key);
  if (existingId !== undefined) {
    const existing = fonts.get(existingId);
    if (existing) existing.refs++;
    return existingId;
  }

  const id = nextFontId++;
  const family = `sdl-font-${id}`;
  const asset = { family, path, size: ptsize, refs: 1 };
  fonts.set(id, asset);
  fontIds.set(key, id);
  const face = new FontFace(family, `url("${assetUrl(path)}")`);
  face.load()
    .then((loaded) => document.fonts.add(loaded))
    .catch(() => console.error(`Failed to load font: ${path}`));
  return id;
}

export function loadTextTexture(fontId: number, text: string): number {
  const font = fonts.get(fontId);
  if (!font) return -1;
  const key = `text:${fontId}:${text}`;
  const existingId = textureIds.get(key);
  if (existingId !== undefined) {
    const existing = textures.get(existingId);
    if (existing) existing.refs++;
    return existingId;
  }

  const surface = document.createElement("canvas");
  const context = surface.getContext("2d");
  if (!context) return -1;
  context.font = `${font.size}px "${font.family}", sans-serif`;
  const metrics = context.measureText(text);
  const width = Math.max(1, Math.ceil(metrics.width));
  const height = Math.max(
    1,
    Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent),
  );
  surface.width = width;
  surface.height = height;
  context.font = `${font.size}px "${font.family}", sans-serif`;
  context.fillStyle = "rgb(220, 220, 220)";
  context.textBaseline = "top";
  context.fillText(text, 0, 0);

  const id = nextTextureId++;
  const asset: TextureAsset = { texture: null, width, height, refs: 1, key };
  textures.set(id, asset);
  textureIds.set(key, id);
  uploadSource(asset, surface, width, height);
  return id;
}

export function releaseTexture(id: number): void {
  const asset = textures.get(id);
  if (!asset || --asset.refs > 0) return;
  if (asset.texture && gl) gl.deleteTexture(asset.texture);
  textures.delete(id);
  textureIds.delete(asset.key);
}

export function releaseFont(id: number): void {
  const asset = fonts.get(id);
  if (!asset || --asset.refs > 0) return;
  fonts.delete(id);
  fontIds.delete(`${asset.path}\0${asset.size}`);
}

export function getTextureWidth(id: number): number {
  return textures.get(id)?.width ?? 0;
}

export function getTextureHeight(id: number): number {
  return textures.get(id)?.height ?? 0;
}

export function clear(): void {
  const context = requireGl();
  context.clearColor(9 / 255, 15 / 255, 29 / 255, 1);
  context.clear(context.COLOR_BUFFER_BIT);
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
): void {
  const asset = textures.get(id);
  if (!asset?.texture || !program || !positionBuffer || !uvBuffer) return;
  const context = requireGl();
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const point = (px: number, py: number): [number, number] => {
    const localX = px - centerX;
    const localY = py - centerY;
    return [
      x + centerX + localX * cosine - localY * sine,
      y + centerY + localX * sine + localY * cosine,
    ];
  };
  const topLeft = point(0, 0);
  const topRight = point(width, 0);
  const bottomLeft = point(0, height);
  const bottomRight = point(width, height);
  const positions = new Float32Array([
    ...topLeft, ...topRight, ...bottomLeft,
    ...bottomLeft, ...topRight, ...bottomRight,
  ]);

  let u0 = sx / asset.width;
  let v0 = sy / asset.height;
  let u1 = (sx + sw) / asset.width;
  let v1 = (sy + sh) / asset.height;
  if (flipX) [u0, u1] = [u1, u0];
  if (flipY) [v0, v1] = [v1, v0];
  const uvs = new Float32Array([
    u0, v0, u1, v0, u0, v1,
    u0, v1, u1, v0, u1, v1,
  ]);

  context.useProgram(program);
  context.uniform2f(resolutionLocation, logicalWidth, logicalHeight);
  context.uniform1i(samplerLocation, 0);
  context.activeTexture(context.TEXTURE0);
  context.bindTexture(context.TEXTURE_2D, asset.texture);
  context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
  context.bufferData(context.ARRAY_BUFFER, positions, context.STREAM_DRAW);
  context.enableVertexAttribArray(positionLocation);
  context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0);
  context.bindBuffer(context.ARRAY_BUFFER, uvBuffer);
  context.bufferData(context.ARRAY_BUFFER, uvs, context.STREAM_DRAW);
  context.enableVertexAttribArray(uvLocation);
  context.vertexAttribPointer(uvLocation, 2, context.FLOAT, false, 0, 0);
  context.drawArrays(context.TRIANGLES, 0, 6);
}

export function drawTexture(id: number, x: number, y: number): void {
  const asset = textures.get(id);
  if (!asset) return;
  draw(id, 0, 0, asset.width, asset.height, x, y, 64, 64, 0, 0, 0, false, false);
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
): void {
  const asset = textures.get(id);
  if (!asset) return;
  draw(
    id, 0, 0, asset.width, asset.height,
    x, y, width, height, angle, centerX, centerY, flipX, flipY,
  );
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
): void {
  draw(
    id, sourceX, sourceY, sourceWidth, sourceHeight,
    x, y, width, height, angle, centerX, centerY, flipX, flipY,
  );
}

export function present(): void {
  gl?.flush();
}

export function onInit(callback: VoidCallback): void {
  initCallback = callback;
  queueMicrotask(startLoop);
}

export function onUpdate(callback: UpdateCallback): void {
  updateCallback = callback;
}

export function onRender(callback: VoidCallback): void {
  renderCallback = callback;
}

export function onTouchStart(callback: TouchCallback): void {
  touchStartCallback = callback;
}

export function onTouchMove(callback: TouchCallback): void {
  touchMoveCallback = callback;
}

export function onTouchEnd(callback: TouchCallback): void {
  touchEndCallback = callback;
}

export function onPause(callback: VoidCallback): void {
  pauseCallback = callback;
}

export function onResume(callback: VoidCallback): void {
  resumeCallback = callback;
}

export function onBackground(callback: VoidCallback): void {
  backgroundCallback = callback;
}

export function onForeground(callback: VoidCallback): void {
  foregroundCallback = callback;
}

export function onInterruption(callback: InterruptionCallback): void {
  interruptionCallback = callback;
}

export function onLowMemory(callback: VoidCallback): void {
  lowMemoryCallback = callback;
}

export function onOrientationChange(callback: OrientationCallback): void {
  orientationCallback = callback;
}

export function onTerminate(callback: VoidCallback): void {
  terminateCallback = callback;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseCallback?.();
    interruptionCallback?.(true);
    backgroundCallback?.();
    lastFrameTime = 0;
  } else {
    foregroundCallback?.();
    interruptionCallback?.(false);
    resumeCallback?.();
  }
});
window.addEventListener("orientationchange", emitOrientation);
window.addEventListener("pagehide", () => terminateCallback?.());

// Browsers do not expose an equivalent low-memory event.
void lowMemoryCallback;
