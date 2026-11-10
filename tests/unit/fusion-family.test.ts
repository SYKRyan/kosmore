import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  parseFamilyCounts,
  parseFusionCards,
  parseMilestones,
  parseRecipes,
} from "../../src/kosmora/fusion";
import { parseCardFamilies } from "../../src/kosmora/friends";
import {
  fusionVerdict,
  tierName,
  tierOf,
} from "../../src/shared/fusion-family";
import {
  describe as describeVerdict,
  FUSION_FAMILY_ATTR,
  FusionFamilyImpact,
} from "../../src/content/fusion-family";
import {
  isRelayMessage,
  RELAY_AUCTIONS,
  RELAY_DATA,
} from "../../src/shared/page-relay";
import { defaults } from "../../src/shared/settings";
import type { CardFamily, OwnedCopy } from "../../src/shared/types";
import {
  batchSellRow,
  sellPickerTile,
  singleSellFixture,
} from "../fixtures/sell-many";
import { RELAY_SALE_BATCH } from "../../src/shared/sale-family-selection";

// Shapes and values as Kosmora returned them on 2026-11-06.
const MS = [2, 5, 10, 25, 50, 100, 250, 500, 1000];
const MILESTONES = { domains: [], milestones: MS.map((count) => ({ count })) };
const RECIPES = { recipes: [{ from: "Common", to: "Uncommon", cards: 2 }] };
const ASTEROIDS = { id: "space.asteroids", name: "Asteroids" };
const PARROTS = { id: "animals.parrots", name: "Parrots" };
const SONGS = { id: "music.songs", name: "Songs" };
const MUSIC_AWARDS = { id: "music.music-awards", name: "Music Awards" };
const MAMA = { id: "music.mama", name: "MAMA Awards" };
const item = (id: string, family: CardFamily | null, quantity = 1) => ({
  card: {
    subjectId: id,
    name: `Card ${id}`,
    rarity: "Common",
    primaryFamily: family,
  },
  quantity,
});

it("parses the game's fusion, family and card reads", () => {
  expect(
    parseFusionCards({
      items: [
        item("302703", ASTEROIDS),
        { card: { subjectId: "x" } },
        item("7", null, 3),
      ],
    }),
  ).toEqual([
    { subjectId: "302703", rarity: "Common", quantity: 1, family: ASTEROIDS },
    { subjectId: "7", rarity: "Common", quantity: 3, family: null },
  ]);
  expect(parseRecipes(RECIPES)).toEqual(new Map([["Common", 2]]));
  expect(parseMilestones(MILESTONES)).toEqual(MS);
  expect(
    parseFamilyCounts({ families: [{ id: "space.asteroids", collected: 4 }] }),
  ).toEqual(new Map([["space.asteroids", 4]]));
  // Card 428004's Children's Books membership doesn't count toward that family.
  expect(
    parseCardFamilies([
      { id: "a", name: "A", economic: true },
      { id: "b", name: "B", economic: false },
    ]),
  ).toEqual([
    { id: "a", name: "A" },
    { id: "b", name: "B", economic: false },
  ]);
  for (const bad of [
    () => parseFusionCards({}),
    () => parseRecipes({}),
    () => parseMilestones({ milestones: [] }),
  ])
    expect(bad).toThrow();
});

it("matches the game's tiers (checked against marginalParts.tierWithout)", () => {
  expect([1, 2, 3, 4, 96, 124, 271].map((n) => tierOf(n, MS))).toEqual([
    0, 1, 1, 1, 5, 6, 7,
  ]);
  expect([0, 1, 4, 9, 14].map(tierName)).toEqual([
    "no tier",
    "I",
    "IV",
    "IX",
    "XIV",
  ]);
});

it("relays family impact reads while the sale-rate feed still takes auctions only", () => {
  const relayed = (path: string) =>
    isRelayMessage({ type: RELAY_DATA, path, data: {} });
  for (const path of [
    "/api/fusion",
    "/api/fusion/cards",
    "/api/families",
    "/api/vortex/lobby",
  ]) {
    expect(relayed(path)).toBe(true);
    expect(RELAY_AUCTIONS.test(path)).toBe(false);
  }
  for (const path of [
    "/api/fusion/quote",
    "/api/me/families",
    "/api/fusion/cards/x",
    "/api/vortex/spin",
    "/api/vortex/inventory",
  ])
    expect(relayed(path)).toBe(false);
});

const verdict = (
  families: CardFamily[],
  counts: Record<string, number>,
  others: Record<string, number> = {},
  leaves = true,
) =>
  fusionVerdict(
    families,
    leaves,
    new Map(Object.entries(counts)),
    new Map(Object.entries(others)),
    MS,
  );
const label = (
  v: ReturnType<typeof verdict>,
  state: { picked: boolean; waiting?: number } = { picked: false },
) => describeVerdict(v!, state).label;
const A4 = { "space.asteroids": 4 };

it("decides safe or not across every family, counting other chosen cards", () => {
  // Asteroids 4, floor 2: two can go; with two others chosen this one drops it.
  expect(verdict([ASTEROIDS], A4)).toEqual({
    safe: true,
    reason: "keeps",
    families: [{ name: "Asteroids", tierBefore: 1, tierAfter: 1, more: 1 }],
  });
  expect(verdict([ASTEROIDS], A4, { "space.asteroids": 2 })).toMatchObject({
    safe: false,
    drops: [{ name: "Asteroids", tierBefore: 1, tierAfter: 0 }],
  });
  // Card 4824: Music Awards 9 keeps tier II, its sub-family MAMA Awards 2 drops.
  expect(
    verdict([MUSIC_AWARDS, MAMA], { "music.music-awards": 9, "music.mama": 2 }),
  ).toMatchObject({
    safe: false,
    drops: [{ name: "MAMA Awards" }],
  });
  expect(verdict([MUSIC_AWARDS, MAMA], { "music.music-awards": 9 })).toBe(null); // unknown count
  expect(verdict([ASTEROIDS], A4, {}, false)).toMatchObject({
    safe: true,
    reason: "spare",
  });
  expect(verdict([], {})).toMatchObject({ safe: true, reason: "no-family" });
});

it("labels each verdict in full", () => {
  expect(
    describeVerdict(verdict([ASTEROIDS], A4, { "space.asteroids": 2 })!, {
      picked: false,
    }),
  ).toEqual({
    parts: [
      ["fixed", "⚠ Loses"],
      ["name", "Asteroids"],
      ["fixed", "I"],
    ],
    label:
      "Not safe: picking this card drops Asteroids from tier I to no tier.",
  });
  const two = describeVerdict(
    verdict([MUSIC_AWARDS, MAMA], {
      "music.music-awards": 10,
      "music.mama": 2,
    })!,
    {
      picked: true,
    },
  );
  expect(two.parts[2]).toEqual(["fixed", "III +1"]);
  expect(two.label).toBe(
    "Not safe: fusing this card drops Music Awards from tier III to II, and MAMA Awards from tier I to no tier.",
  );
  expect(
    describeVerdict(verdict([ASTEROIDS], A4)!, { picked: false }).parts,
  ).toEqual([["fixed", "✓ Safe"]]);
  expect([
    label(verdict([ASTEROIDS], A4)),
    label(verdict([ASTEROIDS], A4, { "space.asteroids": 1 })),
    label(
      verdict([MUSIC_AWARDS, MAMA], {
        "music.music-awards": 9,
        "music.mama": 6,
      }),
    ),
    label(verdict([], {})),
    label(verdict([ASTEROIDS], A4, {}, false)),
    label(verdict([ASTEROIDS], { "space.asteroids": 1 })),
    label(verdict([ASTEROIDS], A4), { picked: true, waiting: 2 }),
  ]).toEqual([
    "Safe to fuse: Asteroids keeps tier I (1 more of its cards can go after this one).",
    "Safe to fuse: Asteroids keeps tier I, but this is the last of its cards that can go.",
    "Safe to fuse: Music Awards keeps tier II (3 more of its cards can go after this one); MAMA Awards keeps tier II, but this is the last of its cards that can go.",
    "Safe to fuse: this card doesn't count toward any family tier.",
    "Safe to fuse: you keep another copy, so Asteroids keeps its count.",
    "Safe to fuse: Asteroids has no tier to lose.",
    "Not in this fusion yet: the game fuses 2 cards at a time, in the order chosen. Once it is: Safe to fuse: Asteroids keeps tier I (1 more of its cards can go after this one).",
  ]);
});

// The Fusion page as the game renders it: grid tiles and the tray.
const IDS = ["1", "2", "3", "4", "5", "6", "7", "8"];
const face = (id: string, art: boolean) => {
  const img = `<img class="kc-img" src="/media/cards/${id}/abc/card.webp">`;
  return `<article class="kc-article"><div class="kc">${art ? `<div class="kc-window">${img}</div>` : img}</div></article>`;
};
function page(chosen: string[] = [], art = false) {
  document.body.innerHTML =
    `<div class="fu-slots">${chosen.map((id) => `<div class="fu-slot fu-slot-on">${face(id, false)}</div>`).join("")}</div>` +
    `<div class="grid">${IDS.map((id) => `<div class="pick">${face(id, art)}<button class="pick-hit"></button></div>`).join("")}</div>`;
}
const host = (id: string) =>
  document
    .querySelector(`.grid img[src*="/cards/${id}/"]`)
    ?.closest(".kc-article")
    ?.querySelector(`[${FUSION_FAMILY_ATTR}]`);
const badge = (id: string) => host(id)?.shadowRoot?.querySelector(".verdict");
const shown = (id: string) => {
  const b = badge(id);
  if (!b) return "-";
  return `${b.className.replace("verdict ", "")}: ${[...b.querySelectorAll("span")].map((s) => s.textContent).join(" | ")}`;
};
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 80));
};
let running: FusionFamilyImpact | undefined;

beforeEach(() => {
  history.replaceState(null, "", "/fusion");
  // jsdom has no IntersectionObserver: every observed tile is near the screen.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        private cb: (r: { target: Element; isIntersecting: boolean }[]) => void,
      ) {}
      observe(target: Element) {
        queueMicrotask(() => this.cb([{ target, isIntersecting: true }]));
      }
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  running?.stop();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const GRID = {
  items: [
    item("1", ASTEROIDS),
    item("2", ASTEROIDS),
    item("3", ASTEROIDS),
    item("4", PARROTS),
    item("5", PARROTS),
    item("6", SONGS),
    item("7", MUSIC_AWARDS), // also in MAMA Awards: the grid names only the primary
    item("8", PARROTS, 2), // a spare copy
  ],
};
const MEMBERSHIP: Record<string, CardFamily[]> = {
  "1": [ASTEROIDS],
  "2": [ASTEROIDS],
  "3": [ASTEROIDS],
  "4": [PARROTS],
  "5": [{ ...PARROTS, economic: false }], // doesn't count toward Parrots
  "6": [SONGS],
  "7": [MUSIC_AWARDS, MAMA],
  "8": [PARROTS],
};
function setup(
  options: {
    gap?: number;
    now?: () => number;
    recipes?: boolean;
    account?: () => Promise<unknown>;
    familyCountsFor?: (ids: string[]) => Promise<Map<string, number>>;
  } = {},
) {
  const accountChanged: (() => void)[] = [];
  let asteroids = 4;
  const client = {
    familyCounts: vi.fn(
      async () =>
        new Map([
          ["space.asteroids", asteroids],
          ["animals.parrots", 2],
          ["music.songs", 271],
          ["music.music-awards", 9],
          ["music.mama", 2],
        ]),
    ),
    familyMilestones: vi.fn(async () => MS),
    insights: vi.fn(async (id: string) => ({ families: MEMBERSHIP[id] })),
    onAccountChange: (fn: () => void) => accountChanged.push(fn),
    ...(options.account ? { account: options.account } : {}),
    familyCountsFor: options.familyCountsFor,
  };
  const impact = new FusionFamilyImpact(
    client,
    window,
    options.gap,
    options.now,
  );
  impact.start();
  running = impact;
  impact.receive("/api/families", MILESTONES);
  if (options.recipes) impact.receive("/api/fusion", RECIPES);
  impact.receive("/api/fusion/cards", GRID);
  impact.setSettings(defaults());
  return {
    client,
    impact,
    switchAccount: () => accountChanged.forEach((fn) => fn()),
    loseAsteroids: (n: number) => (asteroids -= n),
  };
}

it("marks every tile across all its families and follows the tray, reading each card once", async () => {
  page();
  const { client } = setup();
  await settle();
  expect(client.familyMilestones).not.toHaveBeenCalled(); // relayed
  expect(IDS.map(shown)).toEqual([
    "safe: ✓ Safe",
    "safe: ✓ Safe",
    "safe: ✓ Safe",
    "drop: ⚠ Loses | Parrots | I", // Parrots 2
    "safe: ✓ Safe", // non-economic membership only
    "safe: ✓ Safe", // Songs 271
    "drop: ⚠ Loses | MAMA Awards | I", // its primary keeps tier II
    "safe: ✓ Safe", // a spare copy
  ]);
  page(["1", "2"]);
  await settle();
  expect(["1", "2", "3"].map(shown)).toEqual([
    "safe: ✓ Safe",
    "safe: ✓ Safe",
    "drop: ⚠ Loses | Asteroids | I",
  ]);
  expect(client.insights).toHaveBeenCalledTimes(IDS.length);
  expect(client.familyCounts).toHaveBeenCalledTimes(1);
});

it("counts a multi-copy card against its family only once every copy is chosen", async () => {
  page(["8"]);
  setup();
  await settle();
  expect([shown("8"), shown("4")]).toEqual([
    "safe: ✓ Safe",
    "drop: ⚠ Loses | Parrots | I",
  ]);
  page(["8", "8"]);
  await settle();
  // Card 8 now leaves and takes Parrots' tier; card 4 has none left to lose.
  expect([shown("8"), shown("4")]).toEqual([
    "drop: ⚠ Loses | Parrots | I",
    "safe: ✓ Safe",
  ]);
});

it("follows the game's batches: complete ones in pick order, the rest wait (checked live)", async () => {
  // Two per fusion: 1 and 2 are fused; 3 waits and doesn't count against them.
  page(["1", "2", "3"]);
  setup({ recipes: true });
  await settle();
  expect(["1", "2", "3"].map(shown)).toEqual([
    "safe: ✓ Safe",
    "safe: ✓ Safe",
    "drop wait: ⚠ Loses | Asteroids | I",
  ]);
  // 5 and 1 fill a fusion; 2 waits. Picking 3 fuses 2 and 3 with 1: Asteroids 4 → 1.
  page(["5", "1", "2"]);
  await settle();
  expect(["1", "2", "3"].map(shown)).toEqual([
    "safe: ✓ Safe",
    "safe wait: ✓ Safe",
    "drop: ⚠ Loses | Asteroids | I",
  ]);
});

it("counts every chosen card while the recipes are unknown (never under-warns)", async () => {
  page(["1", "2", "3"]);
  setup();
  await settle();
  expect(shown("1")).toBe("drop: ⚠ Loses | Asteroids | I");
});

it("shows nothing until a chosen card's families are known", async () => {
  page(["7"]);
  const { client } = setup();
  let release!: () => void;
  client.insights.mockImplementation(
    (id: string) =>
      new Promise((resolve) => {
        const done = () => resolve({ families: MEMBERSHIP[id] });
        if (id === "7") release = done;
        else done();
      }),
  );
  await settle();
  expect(IDS.map(shown).every((s) => s === "-")).toBe(true);
  release();
  await settle();
  expect(shown("7")).toBe("drop: ⚠ Loses | MAMA Awards | I");
});

it("re-reads counts after a fusion, delayed but never skipped", async () => {
  let clock = 1_000_000;
  page(["1"]);
  const { client, impact, loseAsteroids } = setup({
    gap: 15_000,
    now: () => clock,
  });
  await settle();
  // The next page of the grid (new cards) is not a reload.
  clock += 20_000;
  impact.receive("/api/fusion/cards", { items: [item("99", null)] });
  await settle();
  expect(client.familyCounts).toHaveBeenCalledTimes(1);
  // A fusion empties the tray and the game reloads cards it showed before.
  loseAsteroids(2);
  page([]);
  impact.receive("/api/fusion/cards", GRID);
  await settle();
  expect(client.familyCounts).toHaveBeenCalledTimes(2);
  expect(shown("1")).toBe("drop: ⚠ Loses | Asteroids | I");
  // A reload 1 s later, and one during a read: each refresh comes, after the gap.
  let finish!: () => void;
  client.familyCounts.mockImplementationOnce(
    () =>
      new Promise(
        (resolve) =>
          (finish = () => resolve(new Map([["space.asteroids", 2]]))),
      ),
  );
  clock += 1_000;
  impact.receive("/api/fusion/cards", GRID);
  await settle();
  expect(client.familyCounts).toHaveBeenCalledTimes(2);
  clock += 15_000;
  impact.setSettings(defaults());
  await settle();
  impact.receive("/api/fusion/cards", GRID); // mid-read
  finish();
  await settle();
  expect(client.familyCounts).toHaveBeenCalledTimes(3);
  clock += 15_000;
  impact.setSettings(defaults());
  await settle();
  expect(client.familyCounts).toHaveBeenCalledTimes(4);
  expect(client.familyCounts).toHaveBeenLastCalledWith(
    expect.any(AbortSignal),
    true,
  );
});

it("re-reads counts when the player comes back to the tab", async () => {
  page();
  const { client, loseAsteroids } = setup({ gap: 0 });
  await settle();
  loseAsteroids(2); // sold in another tab
  window.dispatchEvent(new Event("focus"));
  await settle();
  expect(client.familyCounts).toHaveBeenCalledTimes(2);
  expect(shown("1")).toBe("drop: ⚠ Loses | Asteroids | I");
});

it("reads nothing until the account is known, and starts over when it changes", async () => {
  let known!: () => void;
  const account = vi.fn(
    () => new Promise((resolve) => (known = () => resolve(undefined))),
  );
  page();
  const { client, impact, switchAccount } = setup({ account });
  await settle();
  // Confirming the account cancels reads in flight, so none are made before.
  expect(client.insights).not.toHaveBeenCalled();
  expect(client.familyCounts).not.toHaveBeenCalled();
  known();
  await settle();
  expect(shown("4")).toBe("drop: ⚠ Loses | Parrots | I");
  switchAccount();
  await settle();
  expect(shown("4")).toBe("-");
  known();
  impact.receive("/api/fusion/cards", GRID);
  await settle();
  expect(client.familyCounts).toHaveBeenCalledTimes(2);
  expect(shown("4")).toBe("drop: ⚠ Loses | Parrots | I");
});

it("works independently of hover and card overlays and obeys its own switch", async () => {
  page();
  const { impact } = setup();
  impact.setSettings({ ...defaults(), enabled: false });
  await settle();
  expect(shown("4")).toBe("drop: ⚠ Loses | Parrots | I");
  impact.setSettings({
    ...defaults(),
    enabled: false,
    cardOverlaysEnabled: false,
  });
  await settle();
  expect(shown("4")).toBe("drop: ⚠ Loses | Parrots | I");
  impact.setSettings({ ...defaults(), familyImpactOverlaysEnabled: false });
  await settle();
  expect(document.querySelector(`[${FUSION_FAMILY_ATTR}]`)).toBeNull();
  impact.setSettings({ ...defaults(), enabled: false });
  await settle();
  expect(shown("4")).toBe("drop: ⚠ Loses | Parrots | I");
});

it("matches the blacklist only while rendering an otherwise Safe badge with the feature enabled", async () => {
  page();
  const { impact, client } = setup();
  await settle();
  const reads = client.insights.mock.calls.length;
  let blacklistReads = 0;
  const settings = { ...defaults(), useFamilyBlacklist: false };
  Object.defineProperty(settings, "familyBlacklist", {
    get: () => {
      blacklistReads++;
      return [" astéroïds ", "Parrots"];
    },
  });
  impact.setSettings(settings);
  await settle();
  expect(blacklistReads).toBe(0);
  expect(badge("1")?.textContent).toBe("✓ Safe");
  settings.useFamilyBlacklist = true;
  impact.setSettings(settings);
  await settle();
  expect(blacklistReads).toBeGreaterThan(0);
  expect(badge("1")?.textContent).toBe("Blacklist");
  expect(badge("1")?.classList.contains("drop")).toBe(true);
  expect(badge("1")?.getAttribute("aria-label")).toContain(
    "Blacklist: Asteroids",
  );
  // Tier loss still wins, and memberships that don't count toward tiers can be blacklisted.
  expect(badge("4")?.textContent).toBe("⚠ LosesParrotsI");
  expect(badge("5")?.textContent).toBe("Blacklist");
  expect(client.insights).toHaveBeenCalledTimes(reads);
  blacklistReads = 0;
  settings.useFamilyBlacklist = false;
  impact.setSettings(settings);
  await settle();
  expect(blacklistReads).toBe(0);
  expect(badge("1")?.textContent).toBe("✓ Safe");
});

it("sits on the card art, and draws nothing off the Fusion page or with the setting off", async () => {
  page([], true);
  const { impact, client } = setup();
  impact.setSettings({ ...defaults(), showFusionFamilyOverlay: false });
  await settle();
  expect(badge("4")).toBeUndefined();
  expect(client.insights).not.toHaveBeenCalled();
  impact.setSettings(defaults());
  await settle();
  expect(host("4")?.parentElement?.className).toBe("kc-window");
  history.replaceState(null, "", "/collection");
  impact.setSettings(defaults());
  await settle();
  expect(document.querySelector(`[${FUSION_FAMILY_ATTR}]`)).toBeNull();
});

function tradePage() {
  history.replaceState(null, "", "/trades/new?friend=batu");
  document.body.innerHTML = `<main><div class="sx-new-trade"><div data-testid="trade-mine-filters"></div><ul class="sx-picks">${["4", "5", "7", "8"].map((id) => `<li class="sx-pick"><button class="sx-pick-hit">${face(id, true)}</button></li>`).join("")}</ul></div></main>`;
}
const ownedCopies = (quantity: number): OwnedCopy[] =>
  Array.from({ length: quantity }, (_, i) => ({
    id: String(i),
    subjectId: "8",
    state: "available",
    variant: { veil: false, fullArt: false },
  }));
const tradeBadge = (id: string) =>
  document
    .querySelector(`img[src*="/cards/${id}/"]`)
    ?.closest(".kc-article")
    ?.querySelector(`[${FUSION_FAMILY_ATTR}]`)
    ?.shadowRoot?.querySelector(".verdict");

function setupSales(quantities: Record<string, number> = {}) {
  const client = {
    onAccountChange: () => {},
    familyCounts: vi.fn(
      async () =>
        new Map([
          [ASTEROIDS.id, 4],
          [PARROTS.id, 2],
          [MUSIC_AWARDS.id, 9],
          [MAMA.id, 2],
        ]),
    ),
    familyMilestones: vi.fn(async () => MS),
    insights: vi.fn(async (id: string) => ({
      families: MEMBERSHIP[id],
      copies: ownedCopies(quantities[id] ?? 1),
    })),
  };
  const impact = (running = new FusionFamilyImpact(client, window, 15_000));
  impact.start();
  impact.setSettings({
    ...defaults(),
    enabled: false,
    cardOverlaysEnabled: false,
    salesOverlaysEnabled: false,
  });
  return { impact, client };
}
const saleRow = (id: string) =>
  document.querySelector(`img[src*="/cards/${id}/"]`)!.closest(".bsell-row")!;
const saleBadge = (id: string) =>
  saleRow(id)
    .querySelector(`[${FUSION_FAMILY_ATTR}]`)
    ?.shadowRoot?.querySelector(".verdict");
function saleBatch(keys = ["1", "2", "3"]) {
  history.replaceState(null, "", "/market/sell/batch?s=" + keys.join(","));
  document.body.innerHTML = `<ul class="bsell-list">${keys.map((key) => batchSellRow(key.split(".")[0], key, key.endsWith(".v") ? "kc-veil" : key.endsWith(".f") ? "kc-fa" : "")).join("")}</ul>`;
}
function saleSnapshot(
  keys: string[],
  revision = 1,
  source: "batch" | "draft" = "batch",
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      origin: location.origin,
      data: {
        type: RELAY_SALE_BATCH,
        source,
        keys,
        page: location.href,
        revision,
      },
    }),
  );
}

it("checks Sell Many before Continue and recomputes shared families on pick/unpick without re-reading", async () => {
  history.replaceState(null, "", "/market");
  document.body.innerHTML = `<div class="mk-sell-sheet"><ul>${["1", "2", "3", "7"].map((id) => sellPickerTile(id, id)).join("")}</ul><button data-testid="sell-many-go">Continue</button></div>`;
  const { client } = setupSales();
  await settle();
  expect(tradeBadge("3")?.textContent).toBe("✓ Safe");
  expect(tradeBadge("7")?.textContent).toContain("MAMA Awards");
  const picks = document.querySelectorAll<HTMLButtonElement>(".pick-hit");
  picks[0].setAttribute("aria-pressed", "true");
  picks[1].setAttribute("aria-pressed", "true");
  await settle();
  expect(tradeBadge("3")?.textContent).toBe("⚠ LosesAsteroidsI");
  picks[2].setAttribute("aria-pressed", "true");
  await settle();
  expect(tradeBadge("1")?.textContent).toBe("⚠ LosesAsteroidsI");
  const reads = client.insights.mock.calls.length;
  picks[1].setAttribute("aria-pressed", "false");
  await settle();
  expect(tradeBadge("1")?.textContent).toBe("✓ Safe");
  expect(client.insights).toHaveBeenCalledTimes(reads);
  expect(client.familyCounts).toHaveBeenCalledTimes(1);
  expect(document.body.dataset.continued).toBeUndefined();
});

it("keeps picked cards across filters/pages, then clears selection when the picker closes", async () => {
  history.replaceState(null, "", "/market");
  document.body.innerHTML = `<div class="mk-sell-sheet"><ul>${["1", "2", "3"].map((id) => sellPickerTile(id, id)).join("")}</ul><button data-testid="sell-many-go">Continue</button></div>`;
  setupSales();
  await settle();
  const sheet = document.querySelector<HTMLElement>(".mk-sell-sheet")!;
  const picks = sheet.querySelectorAll(".pick-hit");
  picks[0].setAttribute("aria-pressed", "true");
  picks[1].setAttribute("aria-pressed", "true");
  await settle();
  picks[0].closest("li")!.remove();
  picks[1].closest("li")!.remove();
  await settle();
  expect(tradeBadge("3")?.textContent).toBe("⚠ LosesAsteroidsI");
  sheet.hidden = true;
  await settle();
  expect(document.querySelector(`[${FUSION_FAMILY_ATTR}]`)).toBeNull();
  sheet.hidden = false;
  await settle();
  expect(tradeBadge("3")?.textContent).toBe("✓ Safe");
});

it("keeps a gray sale placeholder in the same host while family counts load, then replaces it with Safe", async () => {
  saleBatch(["1"]);
  const { client } = setupSales();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  client.familyCounts.mockImplementationOnce(async () => {
    await waiting;
    return new Map([[ASTEROIDS.id, 4]]);
  });
  await settle();
  const host = saleRow("1").querySelector(`[${FUSION_FAMILY_ATTR}]`);
  expect(saleBadge("1")?.textContent).toBe("Calculating…");
  expect(saleBadge("1")?.classList.contains("pending")).toBe(true);
  release();
  await settle();
  expect(saleBadge("1")?.textContent).toBe("✓ Safe");
  expect(saleRow("1").querySelector(`[${FUSION_FAMILY_ATTR}]`)).toBe(host);
});

it("recalculates draft rows after removal, outside card art and after price badges", async () => {
  saleBatch();
  const after = saleRow("1").querySelector(".bsell-prices")!;
  const prices = document.createElement("div");
  prices.setAttribute("data-kosmore-sales-overlay", "");
  after.after(prices);
  const { client } = setupSales();
  await settle();
  expect(saleBadge("1")?.textContent).toBe("⚠ LosesAsteroidsI");
  expect(prices.nextElementSibling?.hasAttribute(FUSION_FAMILY_ATTR)).toBe(
    true,
  );
  expect(
    document.querySelector(`.kc-article [${FUSION_FAMILY_ATTR}]`),
  ).toBeNull();
  const reads = client.insights.mock.calls.length;
  saleRow("2").querySelector<HTMLButtonElement>(".bsell-x")!.click();
  await settle();
  expect(saleBadge("1")?.textContent).toBe("✓ Safe");
  expect(saleBadge("3")?.textContent).toBe("✓ Safe");
  expect(client.insights).toHaveBeenCalledTimes(reads);
});

it("includes filtered-out draft entries and distinguishes removal from filtering", async () => {
  saleBatch();
  setupSales();
  await settle();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<p class="bsell-shown">Shown 1 of 3</p>',
  );
  const hidden2 = saleRow("2"),
    hidden3 = saleRow("3");
  hidden2.remove();
  hidden3.remove();
  await settle();
  expect(saleBadge("1")?.textContent).toBe("⚠ LosesAsteroidsI");
  document.querySelector(".bsell-list")!.append(hidden2);
  await settle();
  hidden2.querySelector<HTMLButtonElement>(".bsell-x")!.click();
  await settle();
  expect(saleBadge("1")?.textContent).toBe("✓ Safe");
});

it("withholds filtered draft verdicts until a complete native snapshot arrives", async () => {
  saleBatch(["1"]);
  document.body.insertAdjacentHTML(
    "beforeend",
    '<p class="bsell-shown">Shown 1 of 3</p>',
  );
  const { client } = setupSales();
  await settle();
  expect(saleBadge("1")?.textContent).toBe("Calculating…");
  expect(saleBadge("1")?.classList.contains("pending")).toBe(true);
  saleSnapshot(["1", "2", "3"]);
  await settle();
  expect(saleBadge("1")?.textContent).toBe("⚠ LosesAsteroidsI");
  expect(client.insights.mock.calls.map(([id]) => id).sort()).toEqual([
    "1",
    "2",
    "3",
  ]);
  // Late data from a previous page cannot replace this batch.
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      origin: location.origin,
      data: {
        type: RELAY_SALE_BATCH,
        source: "draft",
        keys: ["1"],
        page: location.origin + "/market/sell/batch?s=old",
        revision: 99,
      },
    }),
  );
  await settle();
  expect(saleBadge("1")?.textContent).toBe("⚠ LosesAsteroidsI");
});

it("retains native batch data received before the draft finishes rendering", async () => {
  history.replaceState(null, "", "/market/sell/batch?s=1,2,3");
  document.body.innerHTML = "<p>Loading draft</p>";
  setupSales();
  saleSnapshot(["1", "2", "3"]);
  await settle();
  document.body.innerHTML = `<p class="bsell-shown">Shown 1 of 3</p><ul class="bsell-list">${batchSellRow("1", "1")}</ul>`;
  await settle();
  expect(saleBadge("1")?.textContent).toBe("⚠ LosesAsteroidsI");
});

it("uses the latest draft snapshot and recalculates a filtered draft reset from the original choices", async () => {
  saleBatch();
  const { client } = setupSales();
  await settle();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<p class="bsell-shown">Shown 1 of 2</p><button data-testid="bsell-draft-clear-ok">Reset draft</button>',
  );
  saleRow("2").remove();
  saleRow("3").remove();
  saleSnapshot(["1", "2"], 2, "draft");
  await settle();
  expect(saleBadge("1")?.textContent).toBe("✓ Safe");
  // This older response can supply reset candidates but cannot replace revision 2.
  saleSnapshot(["1", "2", "3"], 1);
  await settle();
  expect(saleBadge("1")?.textContent).toBe("✓ Safe");
  const reads = client.insights.mock.calls.length;
  document
    .querySelector<HTMLButtonElement>('[data-testid="bsell-draft-clear-ok"]')!
    .click();
  await settle();
  expect(saleBadge("1")?.textContent).toBe("⚠ LosesAsteroidsI");
  expect(client.insights).toHaveBeenCalledTimes(reads);
});

it("combines finishes of a subject, counts each family departure once, and keeps spares safe", async () => {
  saleBatch(["4", "4.v"]);
  setupSales({ "4": 2 });
  await settle();
  expect(saleBadge("4")?.textContent).toBe("⚠ LosesParrotsI");
  saleRow("4").querySelector<HTMLButtonElement>(".bsell-x")!.click();
  await settle();
  expect(saleBadge("4")?.textContent).toBe("✓ Safe");
  expect(saleBadge("4")?.getAttribute("aria-label")).toContain(
    "you keep another copy",
  );
});

it("still warns when the other sale entries alone already crossed a tier threshold", async () => {
  saleBatch(["4", "8"]);
  setupSales();
  await settle();
  expect(saleBadge("4")?.textContent).toBe("⚠ LosesParrotsI");
  expect(saleBadge("8")?.textContent).toBe("⚠ LosesParrotsI");
});

it("withholds sale batch verdicts while any selected subject has unknown ownership", async () => {
  saleBatch(["1", "7"]);
  const { client } = setupSales();
  client.insights.mockImplementation(async (id) => ({
    families: MEMBERSHIP[id],
    copies: ownedCopies(id === "7" ? 0 : 1),
  }));
  await settle();
  expect(saleBadge("1")?.textContent).toBe("Impact unavailable");
  expect(saleBadge("1")?.classList.contains("safe")).toBe(false);
});

it("renders sale blacklist badges from existing families without replacing tier-loss warnings", async () => {
  saleBatch(["1", "7"]);
  const { impact, client } = setupSales();
  await settle();
  const reads = client.insights.mock.calls.length;
  impact.setSettings({
    ...defaults(),
    useFamilyBlacklist: true,
    familyBlacklist: ["Asteroids", "MAMA Awards"],
  });
  await settle();
  expect(saleBadge("1")?.textContent).toBe("Blacklist");
  expect(saleBadge("7")?.textContent).toBe("⚠ LosesMAMA AwardsI");
  expect(client.insights).toHaveBeenCalledTimes(reads);
});

it("checks single-sale forms and honors both sale and family master toggles independently", async () => {
  history.replaceState(null, "", "/market/sell?subject=7");
  document.body.innerHTML = singleSellFixture("7");
  const { impact } = setupSales();
  await settle();
  const badge = () =>
    document
      .querySelector(`[${FUSION_FAMILY_ATTR}]`)
      ?.shadowRoot?.querySelector(".verdict");
  expect(badge()?.textContent).toBe("⚠ LosesMAMA AwardsI");
  expect(badge()?.getAttribute("aria-label")).toContain("selling this card");
  impact.setSettings({ ...defaults(), showSalesFamilyOverlay: false });
  await settle();
  expect(badge()).toBeUndefined();
  impact.setSettings({ ...defaults(), familyImpactOverlaysEnabled: false });
  await settle();
  expect(badge()).toBeUndefined();
  impact.setSettings({
    ...defaults(),
    salesOverlaysEnabled: false,
    cardOverlaysEnabled: false,
  });
  await settle();
  expect(badge()?.textContent).toContain("MAMA Awards");
});

it("uses total owned copies and every economic family for trade choices and refreshes ownership on focus", async () => {
  tradePage();
  let quantity = 2;
  const client = {
    onAccountChange: () => {},
    familyCounts: vi.fn(
      async () =>
        new Map([
          [PARROTS.id, 2],
          [MUSIC_AWARDS.id, 9],
          [MAMA.id, 2],
        ]),
    ),
    familyMilestones: async () => MS,
    insights: vi.fn(async (id: string) => ({
      families: MEMBERSHIP[id],
      copies: ownedCopies(id === "8" ? quantity : 1),
    })),
  };
  const impact = (running = new FusionFamilyImpact(client, window, 0));
  impact.start();
  impact.setSettings({
    ...defaults(),
    enabled: false,
    showFusionFamilyOverlay: false,
  });
  await settle();
  expect(tradeBadge("8")?.textContent).toBe("✓ Safe");
  expect(tradeBadge("4")?.getAttribute("aria-label")).toContain(
    "trading this card drops Parrots",
  );
  expect(tradeBadge("5")?.textContent).toBe("✓ Safe");
  expect(tradeBadge("7")?.getAttribute("aria-label")).toContain(
    "MAMA Awards from tier I to no tier",
  );
  quantity = 1;
  window.dispatchEvent(new Event("focus"));
  await settle();
  expect(tradeBadge("8")?.getAttribute("aria-label")).toContain(
    "trading this card drops Parrots",
  );
  expect(client.insights).toHaveBeenCalledWith(
    "8",
    expect.any(AbortSignal),
    true,
  );
});

it("withholds trade verdicts for unknown families, counts or ownership", async () => {
  tradePage();
  const client = {
    onAccountChange: () => {},
    familyCounts: async () => new Map([[MUSIC_AWARDS.id, 9]]),
    familyMilestones: async () => MS,
    insights: async (id: string) => ({
      families: id === "5" ? null : MEMBERSHIP[id],
      copies: ownedCopies(id === "8" ? 0 : 1),
    }),
  };
  const impact = (running = new FusionFamilyImpact(client));
  impact.start();
  impact.setSettings(defaults());
  await settle();
  expect(document.querySelectorAll(`[${FUSION_FAMILY_ATTR}]`)).toHaveLength(0);
});

function vortexPage() {
  history.replaceState(null, "", "/vortex");
  document.body.innerHTML = `<main><div data-testid="vx-row">${["4", "5", "7", "8"].map((id) => `<button data-testid="vx-stake-card">${face(id, true)}</button>`).join("")}</div><div data-testid="vx-picker-grid"><div class="pick">${face("4", true)}</div></div><div data-testid="vx-choices">${face("4", true)}</div></main>`;
}

function setupVortex(gap = 0) {
  const client = {
    onAccountChange: () => {},
    familyCounts: vi.fn(
      async () =>
        new Map([
          [PARROTS.id, 2],
          [MUSIC_AWARDS.id, 9],
          [MAMA.id, 2],
        ]),
    ),
    familyMilestones: async () => MS,
    insights: vi.fn(
      async (
        id: string,
      ): Promise<{ families: CardFamily[] | null; copies?: OwnedCopy[] }> => ({
        families: MEMBERSHIP[id],
        copies: ownedCopies(id === "8" ? 2 : 1),
      }),
    ),
  };
  const impact = (running = new FusionFamilyImpact(client, window, gap));
  impact.start();
  return { client, impact };
}

it.each([
  { name: "Trade", makePage: tradePage },
  { name: "Vortex", makePage: vortexPage },
])(
  "blacklists otherwise Safe $name cards using existing memberships",
  async ({ makePage }) => {
    makePage();
    const { impact, client } = setupVortex();
    impact.setSettings(defaults());
    await settle();
    const reads = client.insights.mock.calls.length;
    expect(tradeBadge("8")?.textContent).toBe("✓ Safe");
    impact.setSettings({
      ...defaults(),
      useFamilyBlacklist: true,
      familyBlacklist: ["Parrots"],
    });
    await settle();
    expect(tradeBadge("8")?.textContent).toBe("Blacklist");
    expect(tradeBadge("4")?.textContent).toBe("⚠ LosesParrotsI");
    expect(client.insights).toHaveBeenCalledTimes(reads);
  },
);

it("marks Vortex stakes and picker cards across all economic families, independently of the other overlays", async () => {
  vortexPage();
  const { impact, client } = setupVortex();
  impact.setSettings({
    ...defaults(),
    enabled: false,
    showFusionFamilyOverlay: false,
    showTradeFamilyOverlay: false,
    showVortexFamilyOverlay: false,
  });
  await settle();
  expect(client.insights).not.toHaveBeenCalled();
  expect(client.familyCounts).not.toHaveBeenCalled();
  impact.setSettings({
    ...defaults(),
    enabled: false,
    showFusionFamilyOverlay: false,
    showTradeFamilyOverlay: false,
  });
  await settle();
  expect(tradeBadge("4")?.getAttribute("aria-label")).toBe(
    "Not safe: losing this card in the Vortex drops Parrots from tier I to no tier.",
  );
  expect(tradeBadge("7")?.textContent).toBe("⚠ LosesMAMA AwardsI");
  expect(tradeBadge("8")?.getAttribute("aria-label")).toContain(
    "Family tiers safe if this copy is lost in the Vortex: you keep another copy",
  );
  expect(tradeBadge("5")?.textContent).toBe("✓ Safe");
  expect(
    document.querySelector(
      '[data-testid="vx-picker-grid"] [data-kosmore-fusion-family]',
    ),
  ).not.toBeNull();
  expect(
    document.querySelector(
      '[data-testid="vx-choices"] [data-kosmore-fusion-family]',
    ),
  ).toBeNull();
  expect(client.insights).toHaveBeenCalledTimes(4); // same card in both surfaces shares one read
  impact.setSettings({ ...defaults(), familyImpactOverlaysEnabled: false });
  await settle();
  expect(document.querySelectorAll(`[${FUSION_FAMILY_ATTR}]`)).toHaveLength(0);
  impact.setSettings(defaults());
  await settle();
  expect(tradeBadge("8")?.textContent).toBe("✓ Safe");
  history.replaceState(null, "", "/vortex/inventory");
  impact.setSettings(defaults());
  await settle();
  expect(document.querySelectorAll(`[${FUSION_FAMILY_ATTR}]`)).toHaveLength(0);
});

it("refreshes Vortex ownership and counts after the native lobby refresh and withholds unknown verdicts", async () => {
  vortexPage();
  const { impact, client } = setupVortex();
  impact.setSettings(defaults());
  await settle();
  expect(tradeBadge("8")?.textContent).toBe("✓ Safe");
  client.insights.mockImplementation(async (id) => ({
    families: id === "5" ? null : MEMBERSHIP[id],
    copies: ownedCopies(id === "4" ? 0 : 1),
  }));
  client.familyCounts.mockResolvedValue(
    new Map([
      [PARROTS.id, 2],
      [MUSIC_AWARDS.id, 9],
    ]),
  );
  impact.receive("/api/vortex/lobby", {});
  await settle();
  expect(tradeBadge("8")?.getAttribute("aria-label")).toContain(
    "drops Parrots",
  );
  for (const id of ["4", "5", "7"]) expect(tradeBadge(id)).toBeUndefined();
  expect(client.insights).toHaveBeenCalledWith(
    "8",
    expect.any(AbortSignal),
    true,
  );
  expect(client.familyCounts).toHaveBeenLastCalledWith(
    expect.any(AbortSignal),
    true,
  );
});

it("withholds Vortex badges when ownership is missing without starving other visible cards", async () => {
  vortexPage();
  const { impact, client } = setupVortex(15_000);
  client.insights.mockImplementation(async (id) => ({
    families: MEMBERSHIP[id],
    copies: id === "4" || id === "7" ? undefined : ownedCopies(2),
  }));
  impact.setSettings(defaults());
  await settle();
  expect(tradeBadge("4")).toBeUndefined();
  expect(tradeBadge("7")).toBeUndefined();
  expect(tradeBadge("8")?.textContent).toBe("✓ Safe");
  expect(client.insights).toHaveBeenCalledTimes(4);
});

it("discards ownership and count reads started before a Vortex refresh", async () => {
  vortexPage();
  const { impact, client } = setupVortex();
  let release!: () => void;
  client.insights.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({ families: [PARROTS], copies: ownedCopies(2) });
      }),
  );
  let releaseCounts!: () => void;
  client.familyCounts.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseCounts = () => resolve(new Map([[PARROTS.id, 3]]));
      }),
  );
  impact.setSettings(defaults());
  await settle();
  impact.receive("/api/vortex/lobby", {});
  release();
  releaseCounts();
  await settle();
  expect(tradeBadge("4")?.getAttribute("aria-label")).toContain(
    "drops Parrots",
  );
  expect(client.insights).toHaveBeenCalledWith(
    "4",
    expect.any(AbortSignal),
    true,
  );
  expect(client.familyCounts).toHaveBeenCalledTimes(2);
});

it("waits before retrying an unknown family from a scoped counts response", async () => {
  page();
  const familyCountsFor = vi.fn(
    async (ids: string[]) =>
      new Map(ids.filter((id) => id !== MAMA.id).map((id) => [id, 10])),
  );
  setup({ gap: 60_000, familyCountsFor });
  await settle();
  expect(familyCountsFor.mock.calls.flatMap(([ids]) => ids)).toContain(MAMA.id);
  expect(shown("7")).toBe("-");
  const reads = familyCountsFor.mock.calls.length;
  await settle();
  expect(familyCountsFor).toHaveBeenCalledTimes(reads);
});
