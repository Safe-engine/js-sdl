/**
 * Ambient declarations for the native `sdl3` module.
 *
 * This module is implemented in C (app/js_sdl3.c) and registered as
 * a QuickJS native module.  Vite/Rollup treats `"sdl3"` as external
 * so the import is preserved as-is at runtime.
 */

declare module "sdl3" {
  /** Create a window and its renderer. */
  export function createWindow(title: string, w: number, h: number): void;

  /**
   * Return logical size, screen size, presentation rectangle, and logical
   * safe area as a flat numeric tuple.
   */
  export function getViewportMetrics(): [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ];

  /** Load a texture from disk.  Returns a texture id (or -1 on failure). */
  export function loadTexture(path: string): number;

  /** Load a TrueType font.  Returns a font id (or -1 on failure). */
  export function loadFont(path: string, ptsize: number): number;

  /** Rasterize or acquire a cached text texture. */
  export function loadTextTexture(fontId: number, text: string): number;

  /** Release one acquired texture/text-texture reference. */
  export function releaseTexture(id: number): void;

  /** Release one acquired font reference. */
  export function releaseFont(id: number): void;

  export function getTextureWidth(id: number): number;
  export function getTextureHeight(id: number): number;

  /** Load an audio asset. Returns an audio id (or -1 on failure). */
  export function loadAudio(path: string): number;

  /** Release one acquired audio asset reference. */
  export function releaseAudio(id: number): void;

  /** Start an audio voice. Returns a voice id (or -1 on failure). */
  export function playAudio(
    audioId: number,
    loop: boolean,
    volume: number,
  ): number;

  export function stopAudio(voiceId: number): void;
  export function pauseAudio(voiceId: number): void;
  export function resumeAudio(voiceId: number): void;
  export function setAudioVolume(voiceId: number, volume: number): void;
  export function isAudioPlaying(voiceId: number): boolean;

  /** Perform platform audio maintenance, including native loop refills. */
  export function updateAudio(): void;

  /** Clear the screen with the default background colour. */
  export function clear(): void;

  /** Draw a previously-loaded texture at (x, y). */
  export function drawTexture(id: number, x: number, y: number): void;

  /** Draw a texture with rotation, scale, and flip support. */
  export function drawTextureRotated(
    id: number, x: number, y: number,
    w: number, h: number,
    angle: number, centerX: number, centerY: number,
    flipX: boolean, flipY: boolean,
    red?: number, green?: number, blue?: number, alpha?: number,
  ): void;

  /** Draw a source region from a texture with rotation, scale, and flip. */
  export function drawTextureRegionRotated(
    id: number,
    sourceX: number, sourceY: number,
    sourceWidth: number, sourceHeight: number,
    x: number, y: number,
    w: number, h: number,
    angle: number, centerX: number, centerY: number,
    flipX: boolean, flipY: boolean,
    red?: number, green?: number, blue?: number, alpha?: number,
  ): void;

  /** Present (swap) the renderer's back-buffer to the screen. */
  export function present(): void;

  /** Register the one-time initialisation callback. */
  export function onInit(cb: () => void): void;

  /** Register the per-frame update callback (receives delta-time in seconds). */
  export function onUpdate(cb: (dt: number) => void): void;

  /** Register the per-frame render callback. */
  export function onRender(cb: () => void): void;

  /** Register the touch/mouse-down callback. */
  export function onTouchStart(cb: (x: number, y: number) => void): void;

  /** Register the touch/mouse-move callback. */
  export function onTouchMove(cb: (x: number, y: number) => void): void;

  /** Register the touch/mouse-up callback. */
  export function onTouchEnd(cb: (x: number, y: number) => void): void;

  export function onPause(cb: () => void): void;
  export function onResume(cb: () => void): void;
  export function onBackground(cb: () => void): void;
  export function onForeground(cb: () => void): void;
  export function onInterruption(cb: (active: boolean) => void): void;
  export function onLowMemory(cb: () => void): void;
  export function onOrientationChange(
    cb: (orientation: number, width: number, height: number) => void,
  ): void;
  export function onTerminate(cb: () => void): void;
}
