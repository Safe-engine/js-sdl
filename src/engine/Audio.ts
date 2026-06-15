import {
  isAudioPlaying,
  loadAudio,
  pauseAudio,
  playAudio,
  releaseAudio,
  resumeAudio,
  setAudioVolume,
  stopAudio,
  updateAudio,
} from "sdl3";

export interface PlayOptions {
  group?: string;
  loop?: boolean;
  volume?: number;
  fadeIn?: number;
}

export interface SoundOptions {
  group?: string;
  maxVoices?: number;
  volume?: number;
}

interface Fade {
  from: number;
  to: number;
  duration: number;
  elapsed: number;
  stopWhenDone: boolean;
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class AudioGroup {
  private _volume = 1;
  private _muted = false;
  private fade: Fade | null = null;

  constructor(
    readonly name: string,
    private readonly changed: () => void,
  ) {}

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = clampVolume(value);
    this.fade = null;
    this.changed();
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    if (this._muted === value) return;
    this._muted = value;
    this.changed();
  }

  fadeTo(volume: number, duration: number): this {
    const target = clampVolume(volume);
    if (duration <= 0) {
      this.volume = target;
      return this;
    }
    this.fade = {
      from: this._volume,
      to: target,
      duration,
      elapsed: 0,
      stopWhenDone: false,
    };
    return this;
  }

  _update(dt: number): void {
    if (!this.fade) return;
    this.fade.elapsed = Math.min(this.fade.duration, this.fade.elapsed + dt);
    const progress = this.fade.elapsed / this.fade.duration;
    this._volume = this.fade.from +
      (this.fade.to - this.fade.from) * progress;
    if (progress >= 1) this.fade = null;
    this.changed();
  }
}

export class AudioClip {
  private released = false;

  constructor(
    readonly path: string,
    readonly id: number,
  ) {}

  release(): void {
    if (this.released) return;
    this.released = true;
    releaseAudio(this.id);
  }
}

export class AudioHandle {
  private _volume: number;
  private manualPaused = false;
  private lifecyclePaused = false;
  private managerPaused = false;
  private stopped = false;
  private fade: Fade | null = null;

  constructor(
    readonly id: number,
    readonly clip: AudioClip,
    readonly group: string,
    readonly loop: boolean,
    volume: number,
    private readonly owner: AudioManager,
    private readonly releaseClipOnStop: boolean,
  ) {
    this._volume = clampVolume(volume);
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = clampVolume(value);
    this.fade = null;
    this._syncVolume();
  }

  get paused(): boolean {
    return this.manualPaused;
  }

  get playing(): boolean {
    return !this.stopped && isAudioPlaying(this.id);
  }

  pause(): this {
    this.manualPaused = true;
    this._syncPause();
    return this;
  }

  resume(): this {
    this.manualPaused = false;
    this._syncPause();
    return this;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    stopAudio(this.id);
    this.owner._forget(this);
    if (this.releaseClipOnStop) this.clip.release();
  }

  fadeTo(volume: number, duration: number): this {
    this._startFade(volume, duration, false);
    return this;
  }

  fadeOut(duration: number, stopWhenDone = true): this {
    this._startFade(0, duration, stopWhenDone);
    return this;
  }

  _setLifecyclePaused(value: boolean): void {
    this.lifecyclePaused = value;
    this._syncPause();
  }

  _setManagerPaused(value: boolean): void {
    this.managerPaused = value;
    this._syncPause();
  }

  _syncVolume(): void {
    if (!this.stopped) {
      setAudioVolume(this.id, this._volume * this.owner._groupGain(this.group));
    }
  }

  _update(dt: number): void {
    if (this.stopped) return;
    if (!isAudioPlaying(this.id)) {
      this.stopped = true;
      this.owner._forget(this);
      if (this.releaseClipOnStop) this.clip.release();
      return;
    }
    if (!this.fade) return;

    this.fade.elapsed = Math.min(this.fade.duration, this.fade.elapsed + dt);
    const progress = this.fade.elapsed / this.fade.duration;
    this._volume = this.fade.from +
      (this.fade.to - this.fade.from) * progress;
    this._syncVolume();
    if (progress < 1) return;

    const stopWhenDone = this.fade.stopWhenDone;
    this.fade = null;
    if (stopWhenDone) this.stop();
  }

  private _startFade(
    volume: number,
    duration: number,
    stopWhenDone: boolean,
  ): void {
    const target = clampVolume(volume);
    if (duration <= 0) {
      this.volume = target;
      if (stopWhenDone) this.stop();
      return;
    }
    this.fade = {
      from: this._volume,
      to: target,
      duration,
      elapsed: 0,
      stopWhenDone,
    };
  }

  private _syncPause(): void {
    if (this.stopped) return;
    if (this.manualPaused || this.lifecyclePaused || this.managerPaused) {
      pauseAudio(this.id);
    } else {
      resumeAudio(this.id);
    }
  }
}

export class Sound {
  private voices: AudioHandle[] = [];
  private released = false;
  readonly group: string;
  readonly maxVoices: number;
  volume: number;

  constructor(
    readonly clip: AudioClip,
    options: SoundOptions,
    private readonly owner: AudioManager,
  ) {
    this.group = options.group ?? "sfx";
    this.maxVoices = Math.max(1, Math.floor(options.maxVoices ?? 4));
    this.volume = clampVolume(options.volume ?? 1);
  }

  play(options: Omit<PlayOptions, "group"> = {}): AudioHandle | null {
    if (this.released) return null;
    this.voices = this.voices.filter((voice) => voice.playing);
    if (this.voices.length >= this.maxVoices) {
      this.voices.shift()!.stop();
    }
    const handle = this.owner._playClip(this.clip, {
      ...options,
      group: this.group,
      volume: this.volume * (options.volume ?? 1),
    }, false);
    if (handle) this.voices.push(handle);
    return handle;
  }

  stopAll(): void {
    for (const voice of [...this.voices]) voice.stop();
    this.voices = [];
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.stopAll();
    this.clip.release();
  }
}

export class AudioManager {
  private groups = new Map<string, AudioGroup>();
  private handles = new Set<AudioHandle>();
  private lifecyclePaused = false;
  private managerPaused = false;
  private music: AudioHandle | null = null;

  constructor() {
    this.group("master");
    this.group("music");
    this.group("sfx");
  }

  group(name: string): AudioGroup {
    let group = this.groups.get(name);
    if (!group) {
      group = new AudioGroup(name, () => this._syncVolumes());
      this.groups.set(name, group);
    }
    return group;
  }

  load(path: string): AudioClip {
    const id = loadAudio(path);
    if (id < 0) throw new Error(`Failed to load audio asset: ${path}`);
    return new AudioClip(path, id);
  }

  createSound(path: string, options: SoundOptions = {}): Sound {
    return new Sound(this.load(path), options, this);
  }

  play(path: string, options: PlayOptions = {}): AudioHandle | null {
    return this._playClip(this.load(path), options, true);
  }

  playMusic(path: string, options: Omit<PlayOptions, "group"> = {}):
    AudioHandle | null {
    this.stopMusic();
    const handle = this.play(path, {
      ...options,
      group: "music",
      loop: options.loop ?? true,
    });
    this.music = handle;
    return handle;
  }

  stopMusic(fadeOut = 0): void {
    if (!this.music) return;
    if (fadeOut > 0) this.music.fadeOut(fadeOut);
    else this.music.stop();
    this.music = null;
  }

  pause(): void {
    if (this.managerPaused) return;
    this.managerPaused = true;
    for (const handle of this.handles) handle._setManagerPaused(true);
  }

  resume(): void {
    if (!this.managerPaused) return;
    this.managerPaused = false;
    for (const handle of this.handles) handle._setManagerPaused(false);
  }

  stopAll(): void {
    for (const handle of [...this.handles]) handle.stop();
    this.music = null;
  }

  _playClip(
    clip: AudioClip,
    options: PlayOptions,
    releaseClipOnStop: boolean,
  ): AudioHandle | null {
    const volume = clampVolume(options.volume ?? 1);
    const initialVolume = options.fadeIn ? 0 : volume;
    const voiceId = playAudio(
      clip.id,
      options.loop ?? false,
      initialVolume * this._groupGain(options.group ?? "sfx"),
    );
    if (voiceId < 0) {
      if (releaseClipOnStop) clip.release();
      return null;
    }

    const handle = new AudioHandle(
      voiceId,
      clip,
      options.group ?? "sfx",
      options.loop ?? false,
      initialVolume,
      this,
      releaseClipOnStop,
    );
    this.handles.add(handle);
    handle._setLifecyclePaused(this.lifecyclePaused);
    handle._setManagerPaused(this.managerPaused);
    if (options.fadeIn) {
      handle.fadeTo(volume, options.fadeIn);
    } else {
      handle._syncVolume();
    }
    return handle;
  }

  _forget(handle: AudioHandle): void {
    this.handles.delete(handle);
    if (this.music === handle) this.music = null;
  }

  _groupGain(name: string): number {
    const master = this.group("master");
    const group = this.group(name);
    if (master.muted || group.muted) return 0;
    return master.volume * (name === "master" ? 1 : group.volume);
  }

  _update(dt: number): void {
    updateAudio();
    for (const group of this.groups.values()) group._update(dt);
    for (const handle of [...this.handles]) handle._update(dt);
  }

  _setLifecyclePaused(value: boolean): void {
    if (this.lifecyclePaused === value) return;
    this.lifecyclePaused = value;
    for (const handle of this.handles) handle._setLifecyclePaused(value);
  }

  private _syncVolumes(): void {
    for (const handle of this.handles) handle._syncVolume();
  }
}

/** Global audio manager with master, music, and sfx groups. */
export const Audio = new AudioManager();
