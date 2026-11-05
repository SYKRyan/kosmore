export function auction(id: number, subjectId = "42", overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    card: { subjectId },
    state: "open",
    startPrice: "10000000",
    bestBid: null,
    endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
}
export function auctionPage() {
  return {
    items: [auction(1), auction(2), auction(3, "43")],
    nextOffset: null,
    total: 3,
  };
}
