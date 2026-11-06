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
import type { CardFamily } from "../../src/shared/types";

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

it("relays the fusion reads only, and the sale-rate feed still takes auctions only", () => {
  const relayed = (path: string) =>
    isRelayMessage({ type: RELAY_DATA, path, data: {} });
  for (const path of ["/api/fusion", "/api/fusion/cards", "/api/families"]) {
    expect(relayed(path)).toBe(true);
    expect(RELAY_AUCTIONS.test(path)).toBe(false);
  }
  for (const path of [
    "/api/fusion/quote",
    "/api/me/families",
    "/api/fusion/cards/x",
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
  expect(client.familyCounts).toHaveBeenLastCalledWith(undefined, true);
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

it("works with hover tooltips disabled and obeys the Card overlays switch", async () => {
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
  expect(document.querySelector(`[${FUSION_FAMILY_ATTR}]`)).toBeNull();
  impact.setSettings({ ...defaults(), enabled: false });
  await settle();
  expect(shown("4")).toBe("drop: ⚠ Loses | Parrots | I");
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
