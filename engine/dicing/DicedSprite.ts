import { AssetManager, type TextureAsset } from '../AssetManager'
import { ComponentX } from '../core/ComponentX'
import { loadJsonAsset } from '../helper/resource-load'
import { globalCommandBuffer } from '../render/RenderCommandBuffer'

export type Meta = {
  name: string
  rawWidth: number
  rawHeight: number
  cellW: number
  cellH: number
  atlasCols: number
  atlasRows: number
  anchorX: number
  anchorY: number
}

export type DicedAnimation = {
  name: string
  fps: number
  frames: number[][][]
}

export type DicedJSON = {
  meta: Meta
  animations: DicedAnimation[]
}

export interface DicedSpriteProps {
  texture?: string
  animation?: string
  loop?: boolean
  showFrame?: number
  data: string | DicedJSON
}

type DicedMesh = {
  positions: readonly [Float32Array, Float32Array, Float32Array, Float32Array]
  uvs: readonly [Float32Array, Float32Array, Float32Array, Float32Array]
  indices: Uint16Array
}

const MAX_MESH_CELLS = 0x3fff

export class DicedSprite extends ComponentX<DicedSpriteProps> {
  private texture: TextureAsset | null = null
  private atlas: DicedJSON | null = null
  private currentAnimation: DicedAnimation | null = null
  private currentMeshes: DicedMesh[][] = []
  private meshesByAnimation = new Map<DicedAnimation, DicedMesh[][]>()
  private texturePath: string | null = null
  private elapsed = 0
  private frameIndex = 0
  private stopFrame: number | null = null
  private loadVersion = 0

  reset() {
    this.stopFrame = null
    this.elapsed = 0
    this.frameIndex = 0
  }

  setAnimation(animation: string, loop = true) {
    if (this.props.animation === animation) return
    this.props.animation = animation
    this.props.loop = loop
    this.reset()
    if (this.atlas) {
      this.setCurrentAnimation(animation)
      return
    }
    void this.reload().catch((error) => {
      console.error('DicedSprite reload failed', error)
    })
  }

  stopAtFrame(frame: number) {
    this.stopFrame = frame
    this.validateStopFrame()
  }

  onStart() {
    void this.reload().catch((error) => {
      console.error('DicedSprite reload failed', error)
    })
  }

  onUpdate(dt: number): void {
    const animation = this.currentAnimation
    if (!animation || animation.frames.length < 2 || animation.fps <= 0) return

    const stopFrame = this.stopFrame
    if (stopFrame !== null && this.frameIndex === stopFrame) return
    if (!this.props.loop && this.frameIndex === animation.frames.length - 1) return

    this.elapsed += dt
    const framesElapsed = Math.floor(this.elapsed * animation.fps)
    if (framesElapsed === 0) return

    if (stopFrame !== null) {
      const framesUntilStop = stopFrame > this.frameIndex
        ? stopFrame - this.frameIndex
        : this.props.loop
          ? animation.frames.length - this.frameIndex + stopFrame
          : Infinity
      if (framesElapsed >= framesUntilStop) {
        this.frameIndex = stopFrame
        this.elapsed = 0
        return
      }
    }

    this.elapsed -= framesElapsed / animation.fps
    this.frameIndex = this.props.loop
      ? (this.frameIndex + framesElapsed) % animation.frames.length
      : Math.min(this.frameIndex + framesElapsed, animation.frames.length - 1)
  }

  onRender(): void {
    const atlas = this.atlas
    const texture = this.texture
    const meshes = this.currentMeshes[this.frameIndex]
    if (!this.node.visible || !atlas || !texture || !meshes) return

    const node = this.node
    const radians = node.worldRotation * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const meshVariant = (node.flipX ? 1 : 0) | (node.flipY ? 2 : 0)
    const opacity = node.opacity * (node.color.a ?? 255)
    const anchorX = -node.anchorX * atlas.meta.rawWidth * node.worldScaleX
    const anchorY = -node.anchorY * atlas.meta.rawHeight * node.worldScaleY
    const translateX = node.worldX + anchorX * cosine - anchorY * sine
    const translateY = node.worldY + anchorX * sine + anchorY * cosine

    for (const mesh of meshes) {
      globalCommandBuffer.pushMesh(
        texture.id, mesh.positions[meshVariant], mesh.uvs[meshVariant], mesh.indices,
        node.color.r, node.color.g, node.color.b, opacity,
        translateX, translateY, node.worldScaleX, node.worldScaleY, cosine, sine,
      )
    }
  }

  onDestroy(): void {
    this.texture?.release()
    this.texture = null
    this.texturePath = null
    this.meshesByAnimation.clear()
  }

  async reload(): Promise<void> {
    const data = this.props.data
    if (!data) return

    const version = ++this.loadVersion
    const atlas = typeof data === 'string'
      ? await loadJsonAsset<DicedJSON>(data, 'diced sprite data')
      : data
    if (version !== this.loadVersion) return

    let animationName = this.props.animation
    if (!animationName) {
      const firstAnimation = atlas.animations[0]
      if (!firstAnimation) {
        throw new Error('Diced sprite data contains no animations')
      }
      animationName = firstAnimation.name
      this.props.animation = animationName
    }

    const texturePath = this.props.texture
      ?? (typeof data === 'string'
        ? resolveSiblingPath(data, `${atlas.meta.name}.png`)
        : `${atlas.meta.name}.png`)

    if (!texturePath) {
      throw new Error('Diced sprite texture path could not be determined')
    }

    this.props.texture = texturePath
    this.props.loop = this.props.loop ?? true
    const textureChanged = this.texturePath !== texturePath
    if (textureChanged) {
      this.texture?.release()
      this.texture = AssetManager.acquireTexture(texturePath)
      this.texturePath = texturePath
    }
    if (textureChanged || this.atlas !== atlas) this.meshesByAnimation.clear()
    this.atlas = atlas
    if (this.props.showFrame != null) {
      this.stopFrame = this.props.showFrame
    }
    this.setCurrentAnimation(animationName)
    if (this.stopFrame !== null) {
      this.frameIndex = this.stopFrame
    }
    this.node.width = atlas.meta.rawWidth
    this.node.height = atlas.meta.rawHeight
    this.node.anchorX = atlas.meta.anchorX ?? 0.5
    this.node.anchorY = atlas.meta.anchorY ?? 0.5
  }

  private setCurrentAnimation(name: string): void {
    const atlas = this.atlas
    const texture = this.texture
    if (!atlas || !texture) return

    const animation = atlas.animations.find(({ name: animationName }) => animationName === name)
    if (!animation) throw new Error(`Diced animation not found: ${name}`)

    this.currentAnimation = animation
    let meshes = this.meshesByAnimation.get(animation)
    if (!meshes) {
      meshes = compileMeshes(animation, atlas.meta, texture.width, texture.height)
      this.meshesByAnimation.set(animation, meshes)
    }
    this.currentMeshes = meshes
    this.elapsed = 0
    this.frameIndex = 0
    this.validateStopFrame()
  }

  private validateStopFrame(): void {
    const animation = this.currentAnimation
    const stopFrame = this.stopFrame
    if (!animation || stopFrame === null) return
    if (!Number.isInteger(stopFrame) || stopFrame < 0 || stopFrame >= animation.frames.length) {
      throw new RangeError(`Diced sprite frame ${stopFrame} is out of range`)
    }
  }
}

function compileMeshes(
  animation: DicedAnimation,
  meta: Meta,
  textureWidth: number,
  textureHeight: number,
): DicedMesh[][] {
  if (textureWidth <= 0 || textureHeight <= 0) return []

  return animation.frames.map((frame) => {
    const cells: Array<{ cell: number, row: number, column: number, rowLength: number }> = []
    for (let row = 0; row < frame.length; row++) {
      const rowCells = frame[row]
      for (let column = 0; column < rowCells.length; column++) {
        const cell = rowCells[column]
        if (cell >= 0) cells.push({ cell, row, column, rowLength: rowCells.length })
      }
    }

    const meshes: DicedMesh[] = []
    for (let start = 0; start < cells.length; start += MAX_MESH_CELLS) {
      meshes.push(compileMesh(cells.slice(start, start + MAX_MESH_CELLS), frame.length, meta, textureWidth, textureHeight))
    }
    return meshes
  })
}

function compileMesh(
  cells: Array<{ cell: number, row: number, column: number, rowLength: number }>,
  rowCount: number,
  meta: Meta,
  textureWidth: number,
  textureHeight: number,
): DicedMesh {
  const positions = [new Float32Array(cells.length * 8), new Float32Array(cells.length * 8), new Float32Array(cells.length * 8), new Float32Array(cells.length * 8)] as const
  const uvs = [new Float32Array(cells.length * 8), new Float32Array(cells.length * 8), new Float32Array(cells.length * 8), new Float32Array(cells.length * 8)] as const
  const indices = new Uint16Array(cells.length * 6)
  const inset = 0.5
  const uWidth = (meta.cellW - inset * 2) / textureWidth
  const vHeight = (meta.cellH - inset * 2) / textureHeight

  for (let index = 0; index < cells.length; index++) {
    const { cell, row, column, rowLength } = cells[index]
    const sourceColumn = cell % meta.atlasCols
    const sourceRow = Math.floor(cell / meta.atlasCols)
    const u0 = (sourceColumn * meta.cellW + inset) / textureWidth
    const v0 = (sourceRow * meta.cellH + inset) / textureHeight
    const offset = index * 8
    const indexOffset = index * 6
    const vertex = index * 4

    writeQuad(positions[0], offset, column, row, meta)
    writeQuad(positions[1], offset, rowLength - 1 - column, row, meta)
    writeQuad(positions[2], offset, column, rowCount - 1 - row, meta)
    writeQuad(positions[3], offset, rowLength - 1 - column, rowCount - 1 - row, meta)
    writeUvs(uvs[0], offset, u0, v0, uWidth, vHeight, false, false)
    writeUvs(uvs[1], offset, u0, v0, uWidth, vHeight, true, false)
    writeUvs(uvs[2], offset, u0, v0, uWidth, vHeight, false, true)
    writeUvs(uvs[3], offset, u0, v0, uWidth, vHeight, true, true)
    indices.set([vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3], indexOffset)
  }

  return { positions, uvs, indices }
}

function writeQuad(target: Float32Array, offset: number, column: number, row: number, meta: Meta): void {
  const x0 = column * meta.cellW
  const y0 = row * meta.cellH
  target.set([x0, y0, x0 + meta.cellW, y0, x0, y0 + meta.cellH, x0 + meta.cellW, y0 + meta.cellH], offset)
}

function writeUvs(target: Float32Array, offset: number, u0: number, v0: number, width: number, height: number, flipX: boolean, flipY: boolean): void {
  const u1 = u0 + width
  const v1 = v0 + height
  const left = flipX ? u1 : u0
  const right = flipX ? u0 : u1
  const top = flipY ? v1 : v0
  const bottom = flipY ? v0 : v1
  target.set([left, top, right, top, left, bottom, right, bottom], offset)
}

function resolveSiblingPath(path: string, sibling: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash >= 0 ? `${path.slice(0, slash + 1)}${sibling}` : sibling
}
