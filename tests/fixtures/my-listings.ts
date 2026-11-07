import { auction } from "./auctions";
export function myListing(id: number, subject = "42", overrides = {}) {
  return {
    ...auction(id, subject),
    seller: "FixturePlayer",
    yours: true,
    group: "unsold",
    state: "expired",
    startPrice: "17000000",
    endsAt: "2026-11-06T16:15:30.000Z",
    ...overrides,
  };
}
export function myListingPage(items: ReturnType<typeof myListing>[] = []) {
  return {
    items,
    groups: {
      selling: items.filter((i) => i.group === "selling").length,
      sold: items.filter((i) => i.group === "sold").length,
      unsold: items.filter((i) => i.group === "unsold").length,
    },
    relistAll: null,
  };
}
