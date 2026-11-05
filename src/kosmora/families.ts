import { object, text } from "./contracts";
export interface FamilyChoice {
  id: string;
  name: string;
  domainName: string;
}
export const foldFamilyName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export function parseFamilyChoices(value: unknown): FamilyChoice[] {
  const data = object(value);
  if (!Array.isArray(data.domains))
    throw new Error("Kosmora's family list is unavailable.");
  const families = new Map<string, FamilyChoice>();
  for (const v of data.domains) {
    const domain = object(v),
      domainName = text(domain.name);
    if (!Array.isArray(domain.families))
      throw new Error("Kosmora returned an unfamiliar family list.");
    for (const item of domain.families) {
      const family = object(item),
        id = text(family.id),
        name = text(family.name);
      if (!id || id.length > 200 || !name.trim() || name.length > 256)
        throw new Error("Kosmora returned an unfamiliar family.");
      const previous = families.get(id);
      if (
        previous &&
        (previous.name !== name || previous.domainName !== domainName)
      )
        throw new Error("Kosmora returned conflicting family identifiers.");
      families.set(id, { id, name, domainName });
    }
  }
  return [...families.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id),
  );
}
export function matchFamily(
  choices: FamilyChoice[],
  name: string,
): FamilyChoice | undefined {
  return choices.find((f) => foldFamilyName(f.name) === foldFamilyName(name));
}
