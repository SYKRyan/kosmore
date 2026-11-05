import { object, text } from "./contracts";
import { handleKey } from "./social";
import type { CardFamily, Friend } from "../shared/types";
export function parseFriends(value: unknown): Friend[] {
  const data = object(value);
  if (!Array.isArray(data.friends))
    throw new Error("Kosmora's friend list is unavailable.");
  const result = new Map<string, Friend>();
  for (const item of data.friends) {
    const handle = text(object(item).handle),
      key = handleKey(handle);
    result.set(key, { handle, key });
  }
  return [...result.values()];
}
export function parseCardFamilies(value: unknown): CardFamily[] {
  if (!Array.isArray(value)) throw new Error("Card families are unavailable.");
  const result = new Map<string, CardFamily>();
  for (const item of value) {
    const f = object(item),
      id = text(f.id),
      name = text(f.name);
    if (!id || id.length > 200 || !name.trim() || name.length > 256)
      throw new Error("Card family data is unfamiliar.");
    if (result.has(id) && result.get(id)!.name !== name)
      throw new Error("Conflicting card families.");
    result.set(id, { id, name });
  }
  return [...result.values()];
}
