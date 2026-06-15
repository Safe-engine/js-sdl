import { describe, expect, test } from "bun:test";
import {
  LocalStorage,
  PersistenceJSON,
} from "../src/engine/PersistenceJSON";

class MemoryStorage implements LocalStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

interface PlayerSave {
  settings: {
    musicVolume: number;
    soundVolume: number;
  };
  progress: {
    unlockedLevel: number;
    highScores: Record<string, number>;
  };
}

const defaults = (): PlayerSave => ({
  settings: { musicVolume: 1, soundVolume: 1 },
  progress: { unlockedLevel: 1, highScores: {} },
});

describe("PersistenceJSON", () => {
  test("returns fresh defaults when no save exists", () => {
    const storage = new MemoryStorage();
    const persistence = new PersistenceJSON("player", {
      version: 1,
      defaults,
      storage,
    });

    const first = persistence.load();
    first.progress.unlockedLevel = 4;

    expect(persistence.load()).toEqual(defaults());
    expect(persistence.exists()).toBe(false);
  });

  test("saves, loads, and removes settings and progress", () => {
    const storage = new MemoryStorage();
    const persistence = new PersistenceJSON("player", {
      version: 1,
      defaults,
      storage,
    });
    const player = defaults();
    player.settings.musicVolume = 0.5;
    player.progress.unlockedLevel = 3;

    persistence.save(player);

    expect(persistence.exists()).toBe(true);
    expect(persistence.load()).toEqual(player);
    expect(JSON.parse(storage.getItem("player")!)).toEqual({
      version: 1,
      data: player,
    });

    persistence.remove();
    expect(persistence.exists()).toBe(false);
  });

  test("runs migrations in order and rewrites the upgraded save", () => {
    const storage = new MemoryStorage();
    storage.setItem("player", JSON.stringify({
      version: 1,
      data: {
        settings: { volume: 0.25 },
        progress: { unlockedLevel: 2 },
      },
    }));

    const persistence = new PersistenceJSON<PlayerSave>("player", {
      version: 3,
      defaults,
      storage,
      migrations: {
        1: (data: any) => ({
          settings: {
            musicVolume: data.settings.volume,
            soundVolume: data.settings.volume,
          },
          progress: data.progress,
        }),
        2: (data: any) => ({
          ...data,
          progress: { ...data.progress, highScores: {} },
        }),
      },
    });

    expect(persistence.load()).toEqual({
      settings: { musicVolume: 0.25, soundVolume: 0.25 },
      progress: { unlockedLevel: 2, highScores: {} },
    });
    expect(JSON.parse(storage.getItem("player")!).version).toBe(3);
  });

  test("rejects corrupt, newer, and unmigratable saves", () => {
    const storage = new MemoryStorage();
    const persistence = new PersistenceJSON("player", {
      version: 2,
      defaults,
      storage,
    });

    storage.setItem("player", "{");
    expect(() => persistence.load()).toThrow("invalid JSON");

    storage.setItem("player", JSON.stringify({ version: 3, data: {} }));
    expect(() => persistence.load()).toThrow("newer version 3");

    storage.setItem("player", JSON.stringify({ version: 1, data: {} }));
    expect(() => persistence.load()).toThrow("missing migration 1 -> 2");
  });
});
