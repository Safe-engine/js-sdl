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

  /** Load a texture from disk.  Returns a texture id (or -1 on failure). */
  export function loadTexture(path: string): number;

  /** Load a TrueType font.  Returns a font id (or -1 on failure). */
  export function loadFont(path: string, ptsize: number): number;

  /** Clear the screen with the default background colour. */
  export function clear(): void;

  /** Draw a previously-loaded texture at (x, y). */
  export function drawTexture(id: number, x: number, y: number): void;

  /** Draw a texture with rotation, scale, and flip support. */
  export function drawTextureRotated(
    id: number, x: number, y: number,
    w: number, h: number,
    angle: number, centerX: number, centerY: number,
    flipX: boolean, flipY: boolean
  ): void;

  /** Draw text using a previously-loaded font. */
  export function drawLabelTTF(
    fontId: number,
    text: string,
    x: number,
    y: number,
    anchorX: number,
    anchorY: number,
    scaleX: number,
    scaleY: number,
    angle: number,
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
}
