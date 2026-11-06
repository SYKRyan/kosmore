/**
 * The game's Fusion page, reduced to the markup KosMore reads (2026-11-06):
 * `.pick` tiles with `.kc-article` faces and a sibling `button.pick-hit`, and the
 * tray's `.fu-slots > .fu-slot.fu-slot-on` holding the chosen cards. Like the game,
 * it loads its own grid and family milestones, and clicking a tile toggles it.
 */
export const FUSION_FAMILIES = {
  asteroids: { id: "space.asteroids", name: "Asteroids" },
  parrots: { id: "animals.parrots", name: "Parrots" },
  long: {
    id: "sports.long",
    name: "Association Football Competitions of the Twentieth Century",
  },
  musicAwards: { id: "music.music-awards", name: "Music Awards" },
  mama: { id: "music.mama", name: "MAMA Awards" },
};

export const fusionGrid = {
  items: [
    ["301", FUSION_FAMILIES.asteroids],
    ["302", FUSION_FAMILIES.asteroids],
    ["303", FUSION_FAMILIES.asteroids],
    ["304", FUSION_FAMILIES.parrots],
    ["305", null],
    ["306", FUSION_FAMILIES.long],
    // Also in MAMA Awards, which the grid does not name.
    ["307", FUSION_FAMILIES.musicAwards],
  ].map(([id, family]) => ({
    card: {
      subjectId: id,
      name: `Fusion card ${id}`,
      rarity: "Common",
      primaryFamily: family,
      domain: { id: "space", name: "Space" },
    },
    quantity: 1,
    available: 1,
    inAuction: 0,
    usable: 1,
    spare: 0,
  })),
  nextCursor: null,
};

/** Every family each card belongs to, as `/api/collection/{id}` lists them. */
export const fusionMembership: Record<string, { id: string; name: string }[]> =
  {
    "301": [FUSION_FAMILIES.asteroids],
    "302": [FUSION_FAMILIES.asteroids],
    "303": [FUSION_FAMILIES.asteroids],
    "304": [FUSION_FAMILIES.parrots],
    "305": [],
    "306": [FUSION_FAMILIES.long],
    "307": [FUSION_FAMILIES.musicAwards, FUSION_FAMILIES.mama],
  };

/** The game's recipes for this player (Master Fuser: 2 Commons per fusion). */
export const fusionRecipes = {
  recipes: [{ from: "Common", to: "Uncommon", cards: 2 }],
  maxBatches: 10,
};

export const familyMilestones = {
  domains: [],
  milestones: [2, 5, 10, 25, 50, 100, 250, 500, 1000].map((count) => ({
    count,
    power: 1,
  })),
};

/** Asteroids 4 (two can go), Parrots 2, the long family 13, Music Awards 9, MAMA Awards 2. */
export const myFamilies = {
  total: 3,
  families: [
    { id: "space.asteroids", collected: 4, nextMilestone: 5 },
    { id: "animals.parrots", collected: 2, nextMilestone: 5 },
    { id: "sports.long", collected: 13, nextMilestone: 25 },
    { id: "music.music-awards", collected: 9, nextMilestone: 10 },
    { id: "music.mama", collected: 2, nextMilestone: 5 },
  ],
};

export function fusionFixture() {
  return `<!doctype html><html><head><title>Fusion</title><style>
body{background:#0c081d;color:#f9e6b6;font:14px system-ui;margin:0;padding:24px}
.fu-slots{display:flex;gap:8px;min-height:40px;margin-bottom:16px}.fu-slot{width:40px;height:40px;border:1px dashed #776}
.fu-slot .kc-img{width:36px;height:36px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--tile,220px),1fr));gap:16px}
.pick{position:relative}.pick-on .kc-article{outline:3px solid #f3dda8}
.kc-article{border:2px solid #a8b1cd;border-radius:12px;background:#243147;padding:8px}
.kc-name{font:600 14px Georgia;margin:4px}.kc-window{overflow:hidden;border-radius:6px}.kc-img{display:block;width:100%;height:150px;object-fit:cover}
.kc footer{font-size:10px;margin:8px 4px;height:22px}
.pick-hit{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}
</style></head><body>
<div class="fu-tray"><div class="fu-slots"></div></div>
<div class="grid"></div>
<script>
const slots = document.querySelector(".fu-slots"), grid = document.querySelector(".grid");
const face = (id, name) => '<article class="kc-article" aria-label="' + name + ', Common"><div class="kc kc-common"><h3 class="kc-name">' + name + '</h3><div class="kc-window"><img class="kc-img" alt="" src="/media/cards/' + id + '/x/card.webp"></div><footer>Common</footer></div></article>';
function drawTray() {
  const on = [...grid.querySelectorAll(".pick-on")];
  slots.innerHTML = on.map((p) => '<div class="fu-slot fu-slot-on"><button class="fu-slot-btn"><div class="kc-wrap kc-wrap-solo">' + face(p.dataset.id, p.dataset.name) + '</div></button></div>').join("") + '<div class="fu-slot"></div>';
}
fetch("/api/fusion").then((r) => r.json()).then(() => fetch("/api/families")).then((r) => r.json()).then(() =>
  fetch("/api/fusion/cards?rarity=Common&limit=60").then((r) => r.json())
).then((page) => {
  for (const it of page.items) {
    const p = document.createElement("div");
    p.className = "pick pick-off";
    p.dataset.id = it.card.subjectId;
    p.dataset.name = it.card.name;
    p.innerHTML = '<div class="kc-wrap kc-wrap-solo">' + face(it.card.subjectId, it.card.name) + '</div><button type="button" class="pick-hit" aria-pressed="false" aria-label="Add ' + it.card.name + ' to the fusion"></button>';
    p.querySelector(".pick-hit").addEventListener("click", (e) => {
      const on = p.classList.toggle("pick-on");
      p.classList.toggle("pick-off", !on);
      e.currentTarget.setAttribute("aria-pressed", String(on));
      drawTray();
    });
    grid.append(p);
  }
  drawTray();
});
</script></body></html>`;
}
