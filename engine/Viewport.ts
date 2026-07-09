export type ViewportMetrics = readonly [
  logicalWidth: number,
  logicalHeight: number,
  screenWidth: number,
  screenHeight: number,
  viewportX: number,
  viewportY: number,
  viewportWidth: number,
  viewportHeight: number,
  safeX: number,
  safeY: number,
  safeWidth: number,
  safeHeight: number,
]

export class Viewport {
  logicalWidth = 1
  logicalHeight = 1
  screenWidth = 1
  screenHeight = 1
  scale = 1
  scaleX = 1
  scaleY = 1
  readonly screenRect: Rect = { x: 0, y: 0, width: 1, height: 1 }
  readonly safeArea: Rect = { x: 0, y: 0, width: 1, height: 1 }
  readonly safeInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  /** Convert window/client coordinates into logical game coordinates. */
  screenToWorld(x: number, y: number): Point {
    return {
      x: (x - this.screenRect.x) / this.scaleX,
      y: (y - this.screenRect.y) / this.scaleY,
    }
  }

  /** Convert logical game coordinates into window/client coordinates. */
  worldToScreen(x: number, y: number): Point {
    return {
      x: this.screenRect.x + x * this.scaleX,
      y: this.screenRect.y + y * this.scaleY,
    }
  }

  /** True when a window/client point falls inside the rendered game area. */
  containsScreenPoint(x: number, y: number): boolean {
    const rect = this.screenRect
    return x >= rect.x && y >= rect.y
      && x <= rect.x + rect.width
      && y <= rect.y + rect.height
  }

  /** Engine-internal: replace the current platform viewport metrics. */
  update(metrics: ViewportMetrics): void {
    const [
      logicalWidth,
      logicalHeight,
      screenWidth,
      screenHeight,
      viewportX,
      viewportY,
      viewportWidth,
      viewportHeight,
      safeX,
      safeY,
      safeWidth,
      safeHeight,
    ] = metrics

    this.logicalWidth = logicalWidth
    this.logicalHeight = logicalHeight
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight
    this.scaleX = viewportWidth / logicalWidth
    this.scaleY = viewportHeight / logicalHeight
    this.scale = this.scaleX
    setRect(
      this.screenRect,
      viewportX,
      viewportY,
      viewportWidth,
      viewportHeight,
    )
    setRect(this.safeArea, safeX, safeY, safeWidth, safeHeight)
    this.safeInsets.top = safeY
    this.safeInsets.left = safeX
    this.safeInsets.right = logicalWidth - safeX - safeWidth
    this.safeInsets.bottom = logicalHeight - safeY - safeHeight
  }
}

export const ActiveViewport = new Viewport()

function setRect(
  rect: Rect,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  rect.x = x
  rect.y = y
  rect.width = width
  rect.height = height
}
