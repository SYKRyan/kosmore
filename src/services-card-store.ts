import type { ServicesCard, ServicesListing } from "./shared/services";

export interface CachedCard {
  key: string;
  fetchedAt: number;
  freshUntil: number;
  card?: ServicesCard;
  missing?: boolean;
}

export interface CachedListings {
  key: string;
  fetchedAt: number;
  listings: (ServicesListing & { subjectId?: string })[];
  freshUntil?: number;
  startedAt?: number;
}

type Stores = { cards: CachedCard; listings: CachedListings };

interface StoredConnection {
  base: string;
  usesDefault?: boolean;
  session?: {
    token: string;
    blocked?: boolean;
    scopes?: string[];
    expiresAt: number;
    playerId: string;
    handle?: string;
  };
}

export class ServicesCardStore {
  private db?: Promise<IDBDatabase>;

  private open() {
    return (this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("kosmore.services", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("connection");
        for (const name of ["cards", "listings"]) {
          if (request.result.objectStoreNames.contains(name)) continue;
          const store = request.result.createObjectStore(name, {
            keyPath: "key",
          });
          store.createIndex("fetchedAt", "fetchedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      this.db = undefined;
      throw error;
    }));
  }

  async get<K extends keyof Stores>(name: K, key: string) {
    const db = await this.open();
    return new Promise<Stores[K] | undefined>((resolve, reject) => {
      const request = db.transaction(name).objectStore(name).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async connection() {
    const db = await this.open();
    return new Promise<StoredConnection | undefined>((resolve, reject) => {
      const request = db
        .transaction("connection")
        .objectStore("connection")
        .get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async getCards(keys: string[]) {
    const db = await this.open();
    const store = db.transaction("cards").objectStore("cards");
    return Promise.all(
      keys.map(
        (key) =>
          new Promise<CachedCard | undefined>((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
      ),
    );
  }

  async saveConnection(connection: StoredConnection, clearListings = true) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        ["connection", "listings"],
        "readwrite",
      );
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore("connection").put(connection, "current");
      if (clearListings) transaction.objectStore("listings").clear();
    });
  }

  async save(
    cards: CachedCard[],
    listings: CachedListings[],
    signal: AbortSignal,
  ) {
    const db = await this.open();
    signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["cards", "listings"], "readwrite");
      const abort = () => {
        try {
          transaction.abort();
        } catch {}
      };
      signal.addEventListener("abort", abort, { once: true });
      transaction.oncomplete = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      transaction.onabort = () => {
        signal.removeEventListener("abort", abort);
        reject(signal.reason ?? transaction.error);
      };
      for (const card of cards) transaction.objectStore("cards").put(card);
      for (const row of listings) transaction.objectStore("listings").put(row);
    });
  }

  async prune(before: number) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["cards", "listings"], "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      for (const name of ["cards", "listings"]) {
        const store = transaction.objectStore(name);
        const rows = store
          .index("fetchedAt")
          .openCursor(IDBKeyRange.upperBound(before));
        rows.onsuccess = () => {
          const cursor = rows.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      }
    });
  }
}
