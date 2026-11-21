import { afterEach, expect, it, vi } from "vitest";
import { GameClient } from "../../src/kosmora/client";
import {
  NativeReadCache,
  FAMILIES_TTL,
  FRIENDS_TTL,
} from "../../src/shared/native-read-cache";
import { SERVICES_STATE_KEY } from "../../src/shared/services";
import { familyCatalog } from "../fixtures/families";
import { card, COPY_A, friends, me } from "../fixtures/data";

afterEach(() => vi.restoreAllMocks());

it("verifies fresh game identity while sharing cached friends and families across tabs", async () => {
  const state: Record<string, unknown> = {};
  const storage = {
    get: async (keys: string[]) =>
      Object.fromEntries(keys.map((key) => [key, state[key]])),
    set: async (changes: Record<string, unknown>) => {
      Object.assign(state, changes);
    },
  };
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const native = vi.fn(async (input: RequestInfo | URL) => {
    switch (input) {
      case "/api/me":
        return Response.json(me);
      case "/api/friends":
        return Response.json(friends);
      case "/api/atlas/families":
        return Response.json(familyCatalog);
      default:
        throw new Error("Unexpected native request " + input);
    }
  });
  const hits = (url: string) =>
    native.mock.calls.filter(([path]) => path === url).length;
  const first = new GameClient(native, new NativeReadCache(storage));
  const second = new GameClient(native, new NativeReadCache(storage));
  await first.account();
  await first.friends();
  await first.families();
  clock.mockReturnValue(now + FRIENDS_TTL - 1);
  await second.account();
  await second.friends(undefined, true);
  await second.families(undefined, true);
  expect(hits("/api/me")).toBe(2);
  expect(hits("/api/friends")).toBe(1);
  expect(hits("/api/atlas/families")).toBe(1);
  clock.mockReturnValue(now + FRIENDS_TTL);
  await second.friends(undefined, true);
  expect(hits("/api/friends")).toBe(2);
  clock.mockReturnValue(now + FAMILIES_TTL);
  await second.families(undefined, true);
  expect(hits("/api/atlas/families")).toBe(2);
  expect(hits("/api/me")).toBe(2);

  clock.mockReturnValue(now + 86_400_000);
  await second.account();
  const before = hits("/api/me");
  state[SERVICES_STATE_KEY] = "disconnected-or-replaced";
  await first.account();
  await first.friends();
  expect(hits("/api/me")).toBe(before + 1);
  expect(hits("/api/friends")).toBe(3);
});

it("checks current identity and ownership again before a copy action", async () => {
  let handle = "FixturePlayer";
  const fetcher = vi.fn(async (url: RequestInfo | URL) => {
    if (url === "/api/me") return Response.json({ handle });
    return Response.json({ ...card(), copies: [] });
  });
  const client = new GameClient(fetcher);
  await client.account();
  await client.observeCardDetails(card());
  await expect(
    client.verifiedCopy("42", COPY_A, "fixtureplayer"),
  ).rejects.toThrow("no longer own");
  handle = "OtherPlayer";
  await expect(
    client.verifiedCopy("42", COPY_A, "fixtureplayer"),
  ).rejects.toThrow("account changed");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "/api/me",
    "/api/me",
    "/api/collection/42",
    "/api/me",
  ]);
});
