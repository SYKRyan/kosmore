import { expect, it, vi } from "vitest";
import {
  interestCounts,
  parseInterestPage,
} from "../../src/kosmora/trade-interest";
import { GameClient } from "../../src/kosmora/client";
import { COPY_A } from "../fixtures/data";

const row = (id: string, rarity = "Common", quantity = 1, rest = {}) => ({
  card: { subjectId: id, rarity },
  quantity,
  available: quantity,
  ...rest,
});
it("counts available copies once across overlapping families and pages, while retaining each finish and individual copy", () => {
  const page = parseInterestPage({
    items: [
      row("1", "Common", 50),
      row("2", "Rare", 20),
      row("1", "Common", 5, { veil: true }),
      row("1", "Common", 1, { oneCopy: true, copy: COPY_A }),
    ],
    nextCursor: null,
  });
  expect(interestCounts([...page.items, ...page.items])).toEqual({
    Common: 56,
    Uncommon: 0,
    Rare: 20,
    Epic: 0,
    Legendary: 0,
    Mythic: 0,
  });
  expect(() =>
    interestCounts([...page.items, { ...page.items[0], quantity: 60 }]),
  ).toThrow("changed");
});
it("excludes unavailable and locked copies instead of using the total quantity", () => {
  const page = parseInterestPage({
    items: [
      row("1", "Common", 100, { available: 70, usable: 50 }),
      row("2", "Epic", 8, { available: 8, usable: 0 }),
      row("3", "Legendary", 6, { available: 0, usable: 0 }),
      row("4", "Mythic", 10, { available: 2 }),
    ],
    nextCursor: null,
  });
  expect(interestCounts(page.items)).toEqual({
    Common: 50,
    Uncommon: 0,
    Rare: 0,
    Epic: 0,
    Legendary: 0,
    Mythic: 2,
  });
  expect(() =>
    parseInterestPage({
      items: [{ card: { subjectId: "1", rarity: "Common" }, quantity: 100 }],
      nextCursor: null,
    }),
  ).toThrow();
});
it("rejects malformed or incomplete collection responses instead of presenting partial totals", () => {
  for (const value of [
    {},
    { items: [], nextCursor: "" },
    { items: [] },
    { items: [row("1", "Unknown")], nextCursor: null },
    { items: [row("1", "Rare", 1, { available: -1 })], nextCursor: null },
    {
      items: [row("1", "Rare", 1, { oneCopy: true, copy: "bad" })],
      nextCursor: null,
    },
  ])
    expect(() => parseInterestPage(value)).toThrow();
});
it("loads all matching family pages through the shared client, caches them, and clears counts on account changes", async () => {
  let handle = "Player";
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://kosmora.io");
    if (url.pathname === "/api/me") return Response.json({ handle });
    expect(url.pathname).toBe("/api/collection");
    expect(url.searchParams.get("split")).toBe("1");
    expect(url.searchParams.get("status")).toBe("available");
    expect(url.searchParams.get("sendable")).toBe("1");
    expect(url.searchParams.has("rarity")).toBe(false);
    const second = url.searchParams.get("cursor") === "next";
    return Response.json({
      items: [
        row(second ? "2" : "1", second ? "Mythic" : "Epic", second ? 2 : 3),
      ],
      nextCursor: second ? null : "next",
    });
  });
  const client = new GameClient(fetcher as typeof fetch);
  await client.account();
  expect(await client.possibleInterest(["films", "games", "films"])).toEqual({
    Common: 0,
    Uncommon: 0,
    Rare: 0,
    Epic: 3,
    Legendary: 0,
    Mythic: 2,
  });
  expect(fetcher).toHaveBeenCalledTimes(5);
  await client.possibleInterest(["films", "games"]);
  expect(fetcher).toHaveBeenCalledTimes(5);
  handle = "Other";
  await client.account();
  await client.possibleInterest(["films"]);
  expect(fetcher).toHaveBeenCalledTimes(8);
});
it("does not return a partial count after failed or cyclic pagination", async () => {
  for (const fail of [false, true]) {
    const client = new GameClient((async (input) => {
      if (fail && String(input).includes("cursor="))
        return Response.json({}, { status: 503 });
      return Response.json({ items: [row("1")], nextCursor: "loop" });
    }) as typeof fetch);
    await expect(client.possibleInterest(["films"])).rejects.toThrow();
  }
});
