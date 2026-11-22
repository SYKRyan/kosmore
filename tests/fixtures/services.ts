export function serviceDetails(id: string) {
  const prices = {
    last30Days: { count: 1, median: "6500000" },
    low: "6000000",
    high: "7000000",
    lastSale: {
      price: "6500000",
      at: "2026-11-20T00:00:00Z",
      numberOne: false,
    },
  };
  const empty = {
    last30Days: { count: 0, median: null },
    low: null,
    high: null,
    lastSale: null,
  };
  return {
    card: {
      id,
      name: "Northern Lights",
      rarity: "Legendary",
      families: [],
      quests: [],
    },
    auctions: [
      { finish: "plain", price: "7500000", bids: 3, endsAt: "2099-11-21T00:00:00Z" },
    ],
    sales: { plain: prices, shiny: empty, fullart: { ...empty } },
    history: {
      plain: [
        {
          day: "2026-11-20",
          count: 1,
          low: "6000000",
          median: "6500000",
          high: "7000000",
        },
      ],
      shiny: [],
      fullart: [],
    },
  };
}

export function serviceRow(id: string, now = Date.now()) {
  return {
    id,
    status: "fresh",
    details: serviceDetails(id),
    fetchedAtUtc: new Date(now).toISOString(),
    freshUntilUtc: new Date(now + 300_000).toISOString(),
    myListings: [
      {
        id: "000000000000000000000042",
        card: { id },
        finish: "shiny",
        startPrice: "8250000",
        endsAt: "2099-11-21T00:00:00Z",
      },
    ],
  };
}
