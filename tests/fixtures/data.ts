// Synthetic fixtures based on observed public-client contracts. No user account data.
export const ALBUM_A = "11111111-1111-4111-8111-111111111111";
export const ALBUM_B = "22222222-2222-4222-8222-222222222222";
export const COPY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const COPY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const OPENING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const me = {
  handle: "FixturePlayer",
  currentOpening: { id: OPENING, state: "presentation_complete" },
};
export const card = (id = "42") => ({
  subjectId: id,
  name: id === "42" ? "Northern Lights" : "Voyager 1",
  rarity: "Rare",
  copies: [
    {
      id: COPY_A,
      state: "available",
      veil: false,
      fullArt: null,
      acquired_at: "2026-11-01T12:00:00Z",
    },
  ],
  interest: { count: 18 },
  popularity: {
    medianDailyViews: 1240,
    source: "Wikimedia Pageviews API (all-access, user agent)",
  },
});
export const albums = (contains = false) => ({
  albums: [
    {
      id: ALBUM_A,
      name: "Space & discovery",
      items: 12,
      contains,
      containsCount: +contains,
    },
    {
      id: ALBUM_B,
      name: "Favourites",
      items: 4,
      contains: false,
      containsCount: 0,
    },
  ],
});
export const prices = (n = 3) => ({
  prices: {
    count: n,
    days: 30,
    low: n ? "12000000" : null,
    median: n ? "18000000" : null,
    high: n ? "24000000" : null,
    sales: Array.from({ length: n }, (_, i) => ({
      auctionId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      price: String((12 + i * 6) * 1_000_000),
      soldAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
    })),
  },
});
export const opening = {
  id: OPENING,
  state: "presentation_complete",
  cards: [
    {
      slot: 0,
      subjectId: "42",
      instanceId: COPY_A,
      rarity: "Rare",
      veil: false,
      card: { fullArt: null },
    },
    {
      slot: 1,
      subjectId: "42",
      instanceId: COPY_B,
      rarity: "Rare",
      veil: false,
      card: { fullArt: null },
    },
  ],
};
export function face(id = "42", name = "Northern Lights", classes = "kc-rare") {
  return `<article class="kc-article" aria-label="${name}, Rare"><div class="kc ${classes}"><h3 class="kc-name">${name}</h3><div class="kc-window"><img class="kc-img" src="/media/cards/${id}/fixture/card.webp" alt="${name}"></div><footer><span data-testid="card-corner">No. ${id.padStart(5, "0")}</span></footer></div></article>`;
}
