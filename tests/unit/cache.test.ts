import { it, expect, vi } from "vitest";
import { ReadCache } from "../../src/shared/cache";
it("a forced refresh replaces an in-flight read without letting its late response overwrite the result", async () => {
  const cache = new ReadCache();
  let release!: (n: number) => void;
  const stale = cache.get(
    "card",
    () =>
      new Promise<number>((r) => {
        release = r;
      }),
  );
  expect(await cache.get("card", async () => 2, true)).toBe(2);
  release(1);
  await stale;
  expect(await cache.get("card", async () => 3)).toBe(2);
});
it("deduplicates reads, bounds its size, and expires values", async () => {
  vi.useFakeTimers();
  const cache = new ReadCache(1, 100);
  const load = vi.fn(async () => 42);
  expect(
    await Promise.all([cache.get("a", load), cache.get("a", load)]),
  ).toEqual([42, 42]);
  expect(load).toHaveBeenCalledTimes(1);
  await cache.get("b", load);
  await cache.get("a", load);
  expect(load).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(101);
  await cache.get("a", load);
  expect(load).toHaveBeenCalledTimes(4);
  vi.useRealTimers();
});
it("does not retain failed reads or responses from a previous account epoch", async () => {
  const cache = new ReadCache();
  await expect(
    cache.get("a", async () => {
      throw Error("offline");
    }),
  ).rejects.toThrow();
  let release!: (n: number) => void;
  const pending = cache.get(
    "a",
    () =>
      new Promise<number>((r) => {
        release = r;
      }),
  );
  cache.clear();
  release(2);
  await pending;
  expect(await cache.get("a", async () => 3)).toBe(3);
});
