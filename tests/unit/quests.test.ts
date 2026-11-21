import { expect, it } from "vitest";
import { parseQuestSubjects } from "../../src/kosmora/quests";
import { questCatalog } from "../fixtures/quests";

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
