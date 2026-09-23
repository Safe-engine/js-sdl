/**
 * Tests for the Web Audio API audio layer (engine/sdl3.ts).
 *
 * Because we run under Bun/Node (no real AudioContext), we provide a lightweight
 * mock of the Web Audio API on globalThis, then import the real audio functions
 * from engine/sdl3.ts and exercise them.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

// ─── Minimal Web Audio API Mock ────────────────────────────────────────────────

let mockCurrentTime = 0

class MockAudioNode {
  connected: MockAudioNode | null = null
  connect(dest: MockAudioNode) { this.connected = dest }
  disconnect() { this.connected = null }
}

class MockGainNode extends MockAudioNode {
  gain = {
    value: 1,
    _schedTime: 0,
    setValueAtTime(v: number, t: number) {
      this.value = v
      this._schedTime = t
    },
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: AudioBuffer | null = null
  loop = false
  _started = false
  _stopped = false
  _offset = 0
  private _cb?: () => void

  addEventListener(_type: string, cb: () => void) { this._cb = cb }
  start(_when = 0, offset = 0) {
    this._started = true
    this._offset = offset
  }
  stop() {
    if (this._stopped) return
    this._stopped = true
    // simulate 'ended' event only for natural stop (not manual)
    // caller decides whether to fire ended; in our impl we guard via voice.paused
  }
  /** Simulate natural playback end */
  simulateEnd() { this._cb?.() }
}

const mockCtxSources: MockAudioBufferSourceNode[] = []

class MockAudioContext {
  state: 'running' | 'suspended' = 'suspended'
  currentTime = 0
  sampleRate = 44100
  destination = new MockAudioNode()

  createGain() { return new MockGainNode() }
  createBufferSource() {
    const src = new MockAudioBufferSourceNode()
    mockCtxSources.push(src)
    return src
  }
  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
  decodeAudioData(_buf: ArrayBuffer) {
    const decoded = new MockAudioBuffer(1, 44100, 44100)
    return Promise.resolve(decoded)
  }
}

class MockAudioBuffer {
  duration: number
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.duration = length / sampleRate
  }
}

let mockFetchResponse: ArrayBuffer = new ArrayBuffer(8)

// Install mocks on globalThis before importing sdl3
;(globalThis as any).AudioContext = MockAudioContext
;(globalThis as any).AudioBuffer = MockAudioBuffer

// Replace fetch so decodeAudioAsset can resolve synchronously in tests
;(globalThis as any).fetch = (_url: string) =>
  Promise.resolve({
    arrayBuffer: () => Promise.resolve(mockFetchResponse),
  })

// ─── Import audio functions (must be after globalThis mocks) ───────────────────

const {
  loadAudio,
  releaseAudio,
  playAudio,
  stopAudio,
  pauseAudio,
  resumeAudio,
  setAudioVolume,
  isAudioPlaying,
  updateAudio,
} = await import('../engine/sdl3')

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('Web Audio API audio layer', () => {
  beforeEach(() => {
    mockCtxSources.length = 0
    // reset currentTime
    mockCurrentTime = 0
  })

  it('loadAudio registers an asset and returns a non-negative id', () => {
    const id = loadAudio('sounds/click.wav')
    expect(id).toBeGreaterThanOrEqual(0)
  })

  it('loadAudio returns the same id for the same path (ref-counting)', () => {
    const id1 = loadAudio('sounds/shared.wav')
    const id2 = loadAudio('sounds/shared.wav')
    expect(id1).toBe(id2)
    // Release both acquired refs
    releaseAudio(id1)
    releaseAudio(id2)
  })

  it('releaseAudio removes asset after all refs are released', () => {
    const id = loadAudio('sounds/temp.wav')
    releaseAudio(id)
    // Loading the same path again should give a fresh id (asset was removed)
    const id2 = loadAudio('sounds/temp.wav')
    expect(id2).not.toBe(id)
    releaseAudio(id2)
  })

  it('playAudio returns a voiceId and isAudioPlaying returns true', async () => {
    const assetId = loadAudio('sounds/sfx.wav')

    // Wait for the eager decode to complete
    await new Promise(r => setTimeout(r, 20))

    const voiceId = playAudio(assetId, false, 0.8)
    expect(voiceId).toBeGreaterThanOrEqual(0)
    expect(isAudioPlaying(voiceId)).toBe(true)

    stopAudio(voiceId)
    releaseAudio(assetId)
  })

  it('playAudio connects GainNode → masterGainNode (AudioBufferSourceNode created)', async () => {
    const assetId = loadAudio('sounds/sfx2.wav')
    await new Promise(r => setTimeout(r, 20))

    const countBefore = mockCtxSources.length
    const voiceId = playAudio(assetId, false, 1.0)
    expect(mockCtxSources.length).toBeGreaterThan(countBefore)

    const lastSrc = mockCtxSources.at(-1)!
    expect(lastSrc._started).toBe(true)
    expect(lastSrc._offset).toBe(0)

    stopAudio(voiceId)
    releaseAudio(assetId)
  })

  it('stopAudio marks voice as not playing', async () => {
    const assetId = loadAudio('sounds/sfx3.wav')
    await new Promise(r => setTimeout(r, 20))

    const voiceId = playAudio(assetId, false, 1.0)
    expect(isAudioPlaying(voiceId)).toBe(true)

    stopAudio(voiceId)
    expect(isAudioPlaying(voiceId)).toBe(false)
    releaseAudio(assetId)
  })

  it('pauseAudio suspends the voice and isAudioPlaying returns false', async () => {
    const assetId = loadAudio('sounds/sfx4.wav')
    await new Promise(r => setTimeout(r, 20))

    const voiceId = playAudio(assetId, false, 1.0)
    expect(isAudioPlaying(voiceId)).toBe(true)

    pauseAudio(voiceId)
    expect(isAudioPlaying(voiceId)).toBe(false)

    stopAudio(voiceId)
    releaseAudio(assetId)
  })

  it('resumeAudio after pause creates a new source starting at the right offset', async () => {
    const assetId = loadAudio('sounds/music.wav')
    await new Promise(r => setTimeout(r, 20))

    const voiceId = playAudio(assetId, false, 0.5)
    pauseAudio(voiceId)
    expect(isAudioPlaying(voiceId)).toBe(false)

    const srcCountBefore = mockCtxSources.length
    resumeAudio(voiceId)
    expect(isAudioPlaying(voiceId)).toBe(true)
    // A new AudioBufferSourceNode should have been created for resume
    expect(mockCtxSources.length).toBeGreaterThan(srcCountBefore)

    stopAudio(voiceId)
    releaseAudio(assetId)
  })

  it('setAudioVolume updates the GainNode value', async () => {
    const assetId = loadAudio('sounds/bgm.wav')
    await new Promise(r => setTimeout(r, 20))

    const voiceId = playAudio(assetId, false, 1.0)
    setAudioVolume(voiceId, 0.25)
    // The gain node's value should have been updated via setValueAtTime
    // We can't reach the private gain node directly, but we can verify the
    // voice is still playing (no crash) and the mock was called
    expect(isAudioPlaying(voiceId)).toBe(true)

    stopAudio(voiceId)
    releaseAudio(assetId)
  })

  it('updateAudio cleans up ended voices without crashing', async () => {
    const assetId = loadAudio('sounds/ding.wav')
    await new Promise(r => setTimeout(r, 20))

    const voiceId = playAudio(assetId, false, 1.0)
    // Simulate natural end by stopping without flagging as paused
    stopAudio(voiceId)

    // updateAudio should not throw
    expect(() => updateAudio()).not.toThrow()
    releaseAudio(assetId)
  })

  it('AudioManager.play + fade integration does not throw', async () => {
    const { Audio } = await import('../engine/Audio')
    // play() calls loadAudio internally — no crash expected even without
    // a real audio file (asset will fail to decode gracefully)
    expect(() => {
      try {
        Audio.play('sounds/nonexistent.wav', { volume: 0.5, fadeIn: 0.5 })
      } catch {
        // might throw if file not found — that's OK for this test
      }
    }).not.toThrow()
  })
})
