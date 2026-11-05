import { expect, it } from "vitest";
import { parseQuestSubjects } from "../../src/kosmora/quests";
import { questCatalog } from "../fixtures/quests";
import { GameClient } from "../../src/kosmora/client";

it("includes unfollowed quests and lit stars without inferring membership from inventory", () => {
  expect(parseQuestSubjects(questCatalog)).toEqual(["42", "44"]);
  expect(parseQuestSubjects({ quests: [] })).toEqual([]);
  expect(
    parseQuestSubjects({
      quests: [
        {
          id: "duplicate",
          stars: [{ subjectId: "00042" }, { subjectId: "42" }],
        },
      ],
    }),
  ).toEqual(["42"]);
});
it("rejects missing catalogs, malformed quests and invalid subject IDs", () => {
  for (const data of [
    {},
    { quests: null },
    { quests: [{}] },
    { quests: [{ id: "q", stars: [{ subjectId: "invalid" }] }] },
  ])
    expect(() => parseQuestSubjects(data)).toThrow();
});
it("reads the verified quest route once per account and invalidates on account changes", async () => {
  let account = "Alice";
  const routes: string[] = [];
  const client = new GameClient(async (input, init) => {
    expect(init?.method).toBe("GET");
    routes.push(String(input));
    return Response.json(
      input === "/api/me" ? { handle: account } : questCatalog,
    );
  });
  await client.account();
  expect(await client.questSubjects()).toEqual(["42", "44"]);
  await client.questSubjects();
  account = "Bob";
  await client.account();
  await client.questSubjects();
  expect(routes.filter((p) => p === "/api/quests")).toHaveLength(2);
});
