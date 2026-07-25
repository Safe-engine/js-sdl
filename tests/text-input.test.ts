import { describe, expect, mock, test } from 'bun:test'
import { Node } from '../engine/core/Node'

let startTextInputCalls = 0

mock.module('../engine/sdl3', () => ({
  startTextInput: () => { startTextInputCalls += 1 },
  stopTextInput: () => {},
  submitCommandBuffer: () => {},
}))

const { TextInput } = await import('../engine/components/TextInput')

describe('TextInput', () => {
  test('has a focusable default hit area', () => {
    const input = new Node('input').addComponent(TextInput)

    expect(input.node.width).toBe(480)
    expect(input.node.height).toBe(80)
    expect(input.hitTest(0, 0)).toBe(true)
  })

  test('preserves an explicitly sized node', () => {
    const node = new Node('input')
    node.width = 320
    node.height = 64
    const input = node.addComponent(TextInput)

    expect(input.node.width).toBe(320)
    expect(input.node.height).toBe(64)
  })

  test('accepts text after focus is restored', () => {
    const input = new Node('input').addComponent(TextInput)
    const initialStartTextInputCalls = startTextInputCalls

    input.focus()
    input.focus()
    TextInput.handleTextInput('gift')
    TextInput.handleKeyDown('Backspace')

    expect(startTextInputCalls).toBe(initialStartTextInputCalls + 2)
    expect(input.value).toBe('gif')
    input.blur()
  })
})
