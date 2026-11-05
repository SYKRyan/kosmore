import { expect, it, vi } from "vitest";
import { matchFamily, parseFamilyChoices } from "../../src/kosmora/families";
import { GameClient } from "../../src/kosmora/client";
import { familyCatalog } from "../fixtures/families";
it("reads every domain and preserves family IDs, names and commas", () => {
  const choices = parseFamilyChoices(familyCatalog);
  expect(choices).toHaveLength(6);
  expect(matchFamily(choices, " ducks, geese and swans ")).toEqual({
    id: "animals.waterfowl",
    name: "Ducks, Geese and Swans",
    domainName: "Animals",
  });
  expect(matchFamily(choices, "cinema")?.name).toBe("Cinéma");
  expect(matchFamily(choices, "Invented family")).toBeUndefined();
});
it("rejects incomplete catalogs and conflicting family IDs", () => {
  expect(() => parseFamilyChoices({ families: [] })).toThrow();
  expect(() =>
    parseFamilyChoices({
      domains: [{ name: "Animals", families: [{ id: 7, name: "Fish" }] }],
    }),
  ).toThrow();
  expect(() =>
    parseFamilyChoices({
      domains: [
        {
          name: "Animals",
          families: [
            { id: "a", name: "Fish" },
            { id: "a", name: "Another name" },
          ],
        },
      ],
    }),
  ).toThrow("conflicting");
});
it("deduplicates authenticated catalog GETs and supports explicit refresh", async () => {
  const fetcher = vi.fn(async () => Response.json(familyCatalog));
  const client = new GameClient(fetcher as typeof fetch);
  await Promise.all([client.families(), client.families()]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/atlas/families",
    expect.objectContaining({ method: "GET", credentials: "same-origin" }),
  );
  await client.families(undefined, true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
