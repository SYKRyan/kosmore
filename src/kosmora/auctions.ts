import { count, date, object, subjectId, text, uuid } from "./contracts";

export function parseAuctionPage(value: unknown) {
  const page = object(value);
  if (!Array.isArray(page.items))
    throw new Error("Active auctions are unavailable.");
  return {
    items: page.items.map((value) => {
      const item = object(value);
      return {
        id: uuid(item.id),
        subjectId: subjectId(object(item.card).subjectId),
        state: text(item.state),
        endsAt: date(item.endsAt),
      };
    }),
    nextOffset: page.nextOffset === null ? null : count(page.nextOffset),
  };
}

export async function countActiveAuctions(
  id: string,
  name: string,
  read: (path: string) => Promise<unknown>,
): Promise<number> {
  id = subjectId(id);
  if (!name.trim()) throw new Error("The card name is unavailable.");
  const listings = new Map<
    string,
    ReturnType<typeof parseAuctionPage>["items"][number]
  >();
  let offset = 0;
  for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
    // Match the native Find at Market search, then filter by ID: names and
    // keywords alone can match other cards, and total includes those matches.
    const query = new URLSearchParams({
      q: name,
      sort: "ending",
      offset: String(offset),
    });
    const page = parseAuctionPage(await read(`/auctions?${query}`));
    for (const item of page.items) listings.set(item.id, item);
    if (page.nextOffset === null) {
      const now = Date.now();
      return [...listings.values()].filter(
        (item) =>
          item.subjectId === id &&
          item.state === "open" &&
          Date.parse(item.endsAt) > now,
      ).length;
    }
    if (page.nextOffset <= offset)
      throw new Error("The market returned an unfamiliar result page.");
    offset = page.nextOffset;
  }
  throw new Error(
    "The market search is too broad to count all active auctions.",
  );
}
