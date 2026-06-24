export interface LocalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type PersistenceMigration = (data: unknown) => unknown;

export interface PersistenceJSONOptions<T> {
  version: number
  defaults: () => T
  migrations?: Readonly<Record<number, PersistenceMigration>>
  storage?: LocalStorage
}

interface SaveFile {
  version: number
  data: unknown
}

function defaultStorage(): LocalStorage {
  const storage = (globalThis as { localStorage?: LocalStorage }).localStorage;
  if (!storage) {
    throw new Error(
      'localStorage is unavailable; pass a LocalStorage implementation',
    );
  }
  return storage;
}

function isSaveFile(value: unknown): value is SaveFile {
  if (!value || typeof value !== 'object') return false;
  const version = (value as SaveFile).version;
  return Number.isInteger(version) && version >= 1 && 'data' in value;
}

/**
 * Stores JSON data in a localStorage-compatible backend and migrates old saves.
 *
 * Migration N receives data from version N and must return data for version N+1.
 */
export class PersistenceJSON<T> {
  private readonly storage: LocalStorage;
  private readonly migrations: Readonly<Record<number, PersistenceMigration>>;

  constructor(
    readonly key: string,
    private readonly options: PersistenceJSONOptions<T>,
  ) {
    if (!key) throw new Error('Persistence key must not be empty');
    if (!Number.isInteger(options.version) || options.version < 1) {
      throw new Error('Persistence version must be a positive integer');
    }

    this.storage = options.storage ?? defaultStorage();
    this.migrations = options.migrations ?? {};
  }

  load(): T {
    const json = this.storage.getItem(this.key);
    if (json === null) return this.options.defaults();

    let save: unknown;
    try {
      save = JSON.parse(json);
    } catch {
      throw new Error(`Save "${this.key}" contains invalid JSON`);
    }

    if (!isSaveFile(save)) {
      throw new Error(`Save "${this.key}" has an invalid format`);
    }
    if (save.version > this.options.version) {
      throw new Error(
        `Save "${this.key}" uses newer version ${save.version}`,
      );
    }

    let version = save.version;
    let data = save.data;
    while (version < this.options.version) {
      const migrate = this.migrations[version];
      if (!migrate) {
        throw new Error(
          `Save "${this.key}" is missing migration ${version} -> ${version + 1}`,
        );
      }
      data = migrate(data);
      version++;
    }

    if (version !== save.version) this.write(version, data);
    return data as T;
  }

  save(data: T): void {
    this.write(this.options.version, data);
  }

  exists(): boolean {
    return this.storage.getItem(this.key) !== null;
  }

  remove(): void {
    this.storage.removeItem(this.key);
  }

  private write(version: number, data: unknown): void {
    this.storage.setItem(this.key, JSON.stringify({ version, data }));
  }
}
