import { describe, expect, test } from 'bun:test'
import { Node } from '../engine/core/Node'

describe('Node events', () => {
  test('registers listeners with on and notifies them with emit', () => {
    const node = new Node('events')
    const calls: Array<[string, number]> = []

    node
      .on('score', (value: number) => {
        calls.push(['first', value])
      })
      .on('score', (value: number) => {
        calls.push(['second', value])
      })

    node.emit('score', 10)

    expect(calls).toEqual([
      ['first', 10],
      ['second', 10],
    ])
  })

  test('removes a specific listener with off', () => {
    const node = new Node('events')
    const calls: string[] = []

    const kept = () => {
      calls.push('kept')
    }
    const removed = () => {
      calls.push('removed')
    }

    node.on('change', kept)
    node.on('change', removed)
    node.off('change', removed)

    node.emit('change')

    expect(calls).toEqual(['kept'])
  })

  test('supports removing all listeners for an event', () => {
    const node = new Node('events')
    let calls = 0

    node.on('change', () => {
      calls += 1
    })
    node.on('change', () => {
      calls += 1
    })

    node.off('change')
    node.emit('change')

    expect(calls).toBe(0)
  })

  test('handles listener removal during emit', () => {
    const node = new Node('events')
    const calls: string[] = []

    const removed = () => {
      calls.push('removed')
    }
    const remover = () => {
      calls.push('remover')
      node.off('change', removed)
    }

    node.on('change', remover)
    node.on('change', removed)

    node.emit('change')

    expect(calls).toEqual(['remover'])
  })

  test('clears listeners when the node is destroyed', () => {
    const node = new Node('events')
    let calls = 0

    node.on('change', () => {
      calls += 1
    })

    node.destroy()
    node.emit('change')

    expect(calls).toBe(0)
  })

  test('binds listener targets passed to on', () => {
    const node = new Node('events')
    const target = {
      total: 0,
      add(this: { total: number }, value: number) {
        this.total += value
      },
    }

    node.on('score', target.add, target)
    node.emit('score', 7)

    expect(target.total).toBe(7)
  })

  test('removes only the matching listener target', () => {
    const node = new Node('events')
    const first = { calls: 0 }
    const second = { calls: 0 }

    function onChange(this: { calls: number }) {
      this.calls += 1
    }

    node.on('change', onChange, first)
    node.on('change', onChange, second)
    node.off('change', onChange, first)
    node.emit('change')

    expect(first.calls).toBe(0)
    expect(second.calls).toBe(1)
  })
})
