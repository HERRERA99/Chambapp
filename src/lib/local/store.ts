// Encrypted persistence of the local snapshot. One record per account, encrypted
// with the vault data key and written with compare-and-swap, so two tabs never
// overwrite each other's changes.
import { decryptBytes, decryptJson, encryptJson, localDataAad } from '../crypto/vault.ts';
import { emptySnapshot, LOCAL_SCHEMA, LocalCommandError } from './types.ts';
import type { LocalSnapshot } from './types.ts';

export type StoredRecord = {
  usuario_id: string;
  /** Vault generation whose data key encrypted `sobre`. */
  generacion_boveda: string;
  revision: number;
  sobre: string;
  actualizado_en: string;
};

/** Minimal storage the store needs; IndexedDB in the browser, memory in tests. */
export interface SnapshotStorage {
  read(userId: string): Promise<StoredRecord | null>;
  /** Writes `next` only if the stored revision is `expected` (null: no record). */
  compareAndSet(userId: string, expected: number | null, next: StoredRecord): Promise<boolean>;
  remove(userId: string): Promise<void>;
}

export function memoryStorage(): SnapshotStorage & { records: Map<string, StoredRecord> } {
  const records = new Map<string, StoredRecord>();
  return {
    records,
    async read(userId) {
      const value = records.get(userId);
      return value ? structuredClone(value) : null;
    },
    async compareAndSet(userId, expected, next) {
      const current = records.get(userId) ?? null;
      if ((current?.revision ?? null) !== expected) return false;
      records.set(userId, structuredClone(next));
      return true;
    },
    async remove(userId) {
      records.delete(userId);
    },
  };
}

const DB_NAME = 'chambapp-local';
const STORE = 'instantaneas';

function request<T>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

let database: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new LocalCommandError('DATOS_LOCALES_NO_DISPONIBLES'));
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE))
        opening.result.createObjectStore(STORE, { keyPath: 'usuario_id' });
    };
    opening.onsuccess = () => {
      const db = opening.result;
      // Another tab upgrading the schema must not be blocked by this one.
      db.onversionchange = () => {
        db.close();
        database = null;
      };
      resolve(db);
    };
    opening.onerror = () => reject(new LocalCommandError('DATOS_LOCALES_NO_DISPONIBLES'));
    opening.onblocked = () => reject(new LocalCommandError('DATOS_LOCALES_OCUPADOS'));
  }).catch((cause) => {
    database = null;
    throw cause;
  });
  return database;
}

export function indexedDbStorage(): SnapshotStorage {
  return {
    async read(userId) {
      const db = await open();
      const value = await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(userId));
      return (value as StoredRecord | undefined) ?? null;
    },
    async compareAndSet(userId, expected, next) {
      const db = await open();
      // Read and write in one transaction: IndexedDB serializes readwrite transactions
      // on the same store across tabs, so the check cannot be raced.
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const current = (await request(store.get(userId))) as StoredRecord | undefined;
      const matches = (current?.revision ?? null) === expected;
      if (matches) store.put(next);
      await done;
      return matches;
    },
    async remove(userId) {
      const db = await open();
      const transaction = db.transaction(STORE, 'readwrite');
      await request(transaction.objectStore(STORE).delete(userId));
    },
  };
}

/** Asks the browser not to evict this site's data; null when it cannot tell. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return null;
  }
}

const MAX_ATTEMPTS = 3;

/** The local snapshot of one account, decrypted with the vault data key. */
export class LocalStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly storage: SnapshotStorage;
  private readonly userId: string;
  private readonly key: CryptoKey;
  private readonly generation: string;
  private readonly clock: () => Date;
  /**
   * Last snapshot read or written, by stored revision and timestamp: decrypting and
   * parsing tens of MB on every command would make writes slow.
   */
  private cache: { revision: number; stamp: string; snapshot: LocalSnapshot } | null = null;

  constructor(
    storage: SnapshotStorage,
    userId: string,
    key: CryptoKey,
    generation: string,
    clock: () => Date = () => new Date(),
  ) {
    this.storage = storage;
    this.userId = userId;
    this.key = key;
    this.generation = generation;
    this.clock = clock;
  }

  /** Snapshot and revision; null when this browser has no local data for the account. */
  async load(): Promise<{ snapshot: LocalSnapshot; revision: number } | null> {
    const stored = await this.storage.read(this.userId);
    if (!stored) {
      this.cache = null;
      return null;
    }
    if (this.cache?.revision === stored.revision && this.cache.stamp === stored.actualizado_en)
      return { snapshot: this.cache.snapshot, revision: stored.revision };
    const snapshot = await this.decrypt(stored);
    this.cache = { revision: stored.revision, stamp: stored.actualizado_en, snapshot };
    return { snapshot, revision: stored.revision };
  }

  /** Whether a record exists, without decrypting it. */
  async exists(): Promise<boolean> {
    return (await this.storage.read(this.userId)) !== null;
  }

  private async decrypt(stored: StoredRecord): Promise<LocalSnapshot> {
    if (stored.usuario_id !== this.userId) throw new LocalCommandError('SESION_REQUERIDA');
    if (stored.generacion_boveda !== this.generation)
      throw new LocalCommandError('DATOS_LOCALES_ILEGIBLES');
    let value: unknown;
    try {
      value = await decryptJson(this.key, localDataAad(this.userId), stored.sobre);
    } catch {
      throw new LocalCommandError('DATOS_LOCALES_ILEGIBLES');
    }
    const snapshot = value as LocalSnapshot;
    if (snapshot?.esquema !== LOCAL_SCHEMA || snapshot.usuario_id !== this.userId)
      throw new LocalCommandError('DATOS_LOCALES_ILEGIBLES');
    return snapshot;
  }

  private async record(snapshot: LocalSnapshot, revision: number): Promise<StoredRecord> {
    return {
      usuario_id: this.userId,
      generacion_boveda: this.generation,
      revision,
      sobre: await encryptJson(this.key, localDataAad(this.userId), snapshot),
      actualizado_en: this.clock().toISOString(),
    };
  }

  /**
   * Applies `change` to the current snapshot and stores the result. If another tab
   * wrote in between, `change` runs again on the fresh snapshot (it must be pure).
   * Changes in this tab run one after another.
   */
  mutate<T>(
    change: (snapshot: LocalSnapshot) => { snapshot: LocalSnapshot; result: T },
  ): Promise<T> {
    const run = this.queue.then(async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const current = await this.load();
        const base = current?.snapshot ?? emptySnapshot(this.userId);
        const { snapshot, result } = change(base);
        if (snapshot === base) return result; // nothing to store
        const revision = (current?.revision ?? 0) + 1;
        const next = await this.record(snapshot, revision);
        // Never store what could not be read back: the data would be lost.
        await decryptBytes(this.key, localDataAad(this.userId), next.sobre).catch(() => {
          throw new LocalCommandError('DATOS_LOCALES_ILEGIBLES');
        });
        if (await this.storage.compareAndSet(this.userId, current?.revision ?? null, next)) {
          this.cache = { revision, stamp: next.actualizado_en, snapshot };
          return result;
        }
      }
      throw new LocalCommandError('DATOS_LOCALES_OCUPADOS');
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Removes this account's local data from this browser. */
  destroy() {
    this.cache = null;
    const run = this.queue.then(() => this.storage.remove(this.userId));
    this.queue = run.catch(() => undefined);
    return run;
  }
}
