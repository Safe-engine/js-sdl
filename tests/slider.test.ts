import { describe, expect, mock, test } from 'bun:test'
import { InputSystem } from '../engine/Input'
import { Slider } from '../engine/components/Slider'
import { Node } from '../engine/core/Node'

mock.module('sdl3', () => ({
  drawRect: () => {},
  drawTextureRegionRotated: () => {},
  popClipRect: () => {},
  pushClipRect: () => {},
  getTextureHeight: () => 0,
  getTextureWidth: () => 0,
  loadFont: () => 1,
  loadTextTexture: () => 1,
  loadTexture: () => 1,
  releaseFont: () => {},
  releaseTexture: () => {},
}))

describe('Slider', () => {
  test('snaps values to the configured range and step', () => {
    const node = new Node('slider')
    const slider = node.addComponent(Slider, {
      min: 10,
      max: 30,
      step: 5,
      value: 12,
    })

    expect(slider.value).toBe(10)

    slider.setValue(28)
    expect(slider.value).toBe(30)

    slider.setValue(-100)
    expect(slider.value).toBe(10)
  })

  test('updates horizontal value during pointer drag', () => {
    const root = new Node('root')
    const node = new Node('slider')
    node.anchorX = 0
    node.anchorY = 0
    node.width = 100
    node.height = 20
    root.addChild(node)

    const changes: number[] = []
    const slider = node.addComponent(Slider, {
      onChange: value => changes.push(value),
    })
    const input = new InputSystem(root)

    input.dispatchStart(25, 10)
    input.dispatchMove(75, 10)
    input.dispatchEnd(75, 10)

    expect(slider.value).toBe(0.75)
    expect(changes).toEqual([0.25, 0.75])
  })

  test('maps vertical pointer input from bottom to top', () => {
    const root = new Node('root')
    const node = new Node('slider')
    node.anchorX = 0
    node.anchorY = 0
    node.width = 20
    node.height = 100
    root.addChild(node)

    const slider = node.addComponent(Slider, {
      min: 0,
      max: 100,
      vertical: true,
    })
    const input = new InputSystem(root)

    input.dispatchStart(10, 75)
    expect(slider.value).toBe(25)

    input.dispatchMove(10, 10)
    input.dispatchEnd(10, 10)
    expect(slider.value).toBe(90)
  })
})
