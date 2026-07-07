import { describe, expect, test } from 'bun:test'
import { InputEvent } from '../engine/Input'
import { ComponentX } from '../engine/core/ComponentX'
import { Scene } from '../engine/core/Scene'
import { Node } from '../engine/core/Node'

class TouchRecorderScene extends Scene {
  readonly log: Array<[string, number, number]> = []

  override onTouchStart(x: number, y: number): void {
    this.log.push(['start', x, y])
  }

  override onTouchMove(x: number, y: number): void {
    this.log.push(['move', x, y])
  }

  override onTouchEnd(x: number, y: number): void {
    this.log.push(['end', x, y])
  }
}

class HitRecorder extends ComponentX<{ log: string[], consumeInput?: boolean }> {
  inputEnabled = true

  hitTest(): boolean {
    return true
  }

  onPointerStart(event: InputEvent): void {
    this.props.log.push('start')
    if (this.props.consumeInput) event.stopPropagation()
  }

  onPointerMove(event: InputEvent): void {
    this.props.log.push('move')
    if (this.props.consumeInput) event.stopPropagation()
  }

  onPointerEnd(event: InputEvent): void {
    this.props.log.push('end')
    if (this.props.consumeInput) event.stopPropagation()
  }
}

describe('Scene touch dispatch', () => {
  test('calls scene touch callbacks when no component consumes input', () => {
    const scene = new TouchRecorderScene()

    scene._dispatchTouchStart(10, 20)
    scene._dispatchTouchMove(30, 40)
    scene._dispatchTouchEnd(50, 60)

    expect(scene.log).toEqual([
      ['start', 10, 20],
      ['move', 30, 40],
      ['end', 50, 60],
    ])
  })

  test('suppresses scene touch callbacks while a component consumes input', () => {
    const scene = new TouchRecorderScene()
    const log: string[] = []
    const node = new Node('button')
    node.addComponent(HitRecorder, { log, consumeInput: true })
    scene.node.addChild(node)

    scene._dispatchTouchStart(10, 20)
    scene._dispatchTouchMove(30, 40)
    scene._dispatchTouchEnd(50, 60)

    expect(log).toEqual(['start', 'move', 'end'])
    expect(scene.log).toEqual([])
  })
})
