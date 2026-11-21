import { SERVICES_STATE_KEY } from "./services";

export const FRIENDS_TTL = 300_000;
export const FAMILIES_TTL = 3_600_000;

interface Storage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

type Entry<T> = {
  generation: unknown;
  until: number;
} & ({ value: T } | { error: string });

/** Shares quota-limited native reads between Kosmora tabs, including after reload. */
export class NativeReadCache {
  constructor(private storage: Storage) {}

  async get<T>(
    name: string,
    ttl: number,
    load: () => Promise<T>,
    signal?: AbortSignal,
    accountScoped = true,
  ): Promise<T> {
    const key = `kosmore.nativeRead.${name}`;
    const lookup = async () => {
      signal?.throwIfAborted();
      const keys = accountScoped ? [key, SERVICES_STATE_KEY] : [key];
      const stored = await this.storage.get(keys);
      const generation = stored[SERVICES_STATE_KEY];
      const hit = stored[key] as Entry<T> | undefined;
      if (hit?.generation === generation && hit && hit.until > Date.now()) {
        if ("value" in hit) return hit.value;
      }
      const until = Date.now() + ttl;
      const next = { generation, until, value: await load() };
      if (
        accountScoped &&
        (await this.storage.get([SERVICES_STATE_KEY]))[SERVICES_STATE_KEY] !==
          generation
      )
        throw new DOMException(
          "KosMore Services connection changed.",
          "AbortError",
        );
      await this.storage.set({ [key]: next });

      return next.value;
    };
    const value =
      typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request(key, { signal }, lookup)
        : await lookup();
    signal?.throwIfAborted();
    return value;
  }
}
