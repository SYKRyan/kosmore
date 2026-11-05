import { object, subjectId, text } from "./contracts";

// GET /quests includes every quest's stars, including unfollowed and lit stars.
// /quests/wanted is narrower: it only describes cards still needed by followed quests.
export function parseQuestSubjects(value: unknown): string[] {
  const data = object(value);
  if (!Array.isArray(data.quests))
    throw new Error("Kosmora's quest catalog is unavailable.");
  const subjects = new Set<string>();
  for (const item of data.quests) {
    const quest = object(item);
    if (!text(quest.id).trim() || !Array.isArray(quest.stars))
      throw new Error("Kosmora's quest data is unfamiliar.");
    for (const star of quest.stars)
      subjects.add(subjectId(object(star).subjectId));
  }
  return [...subjects];
}
