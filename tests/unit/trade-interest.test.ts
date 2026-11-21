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
it("uses only complete observed sendable collection data for the verified account", async () => {
  let handle = "Player";
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    expect(input).toBe("/api/me");
    return Response.json({ handle });
  });
  const client = new GameClient(fetcher as typeof fetch);
  await client.account();
  const path = "/api/collection?family=films&status=available&sendable=1";
  client.observeCollection(path, { items: [row("1")], nextCursor: "next" });
  await expect(client.possibleInterest(["films"])).rejects.toThrow(
    "unavailable",
  );
  client.observeCollection(path, {
    items: [row("1", "Epic", 3)],
    nextCursor: null,
  });
  client.observeCollection(path.replace("films", "games"), {
    items: [row("2", "Mythic", 2)],
    nextCursor: null,
  });
  expect(
    await client.possibleInterest(["films", "games", "films"]),
  ).toMatchObject({ Epic: 3, Mythic: 2 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  handle = "Other";
  await client.account();
  await expect(client.possibleInterest(["films"])).rejects.toThrow(
    "unavailable",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
