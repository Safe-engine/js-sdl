import { describe, expect, test } from 'bun:test'
import { InputEvent, Touch } from '../engine/Input'
import { ComponentX } from '../engine/core/ComponentX'
import { Scene } from '../engine/core/Scene'
import { Node } from '../engine/core/Node'
import { TouchEventRegister } from '../engine/components/TouchEventRegister'

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

  test('passes Touch events with location and delta to touch register callbacks', () => {
    const scene = new TouchRecorderScene()
    const log: Array<[string, Vec2, Vec2, boolean]> = []
    scene.node.width = 100
    scene.node.height = 100
    scene.node.addComponent(TouchEventRegister, {
      onTouchStart(event) {
        log.push(['start', event.getLocation(), event.getDelta(), event instanceof Touch])
      },
      onTouchMove(event) {
        log.push(['move', event.getLocation(), event.getDelta(), event instanceof Touch])
      },
    })

    scene._dispatchTouchStart(10, 20)
    scene._dispatchTouchMove(13, 25)
    scene._dispatchTouchMove(12, 20)

    expect(log).toEqual([
      ['start', { x: 10, y: 20 }, { x: 0, y: 0 }, true],
      ['move', { x: 13, y: 25 }, { x: 3, y: 5 }, true],
      ['move', { x: 12, y: 20 }, { x: -1, y: -5 }, true],
    ])
    expect(scene.log).toEqual([])
  })
})
