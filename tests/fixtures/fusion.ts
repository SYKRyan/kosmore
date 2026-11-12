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

/** The picker groups duplicate subjects and exposes the exact copy in each native select. */
export function fusionBatchFixture() {
  return `<!doctype html><html><head><title>Fusion</title><style>
body{background:#0c081d;color:#f9e6b6;font:14px system-ui;margin:0;padding:24px}
.fu-tools,.fu-slots,.fu-copies{display:flex;gap:8px;align-items:center}
.chip-btn{background:#241839;color:#f9e6b6;border:1px solid #796592;padding:6px 12px;border-radius:16px}
.fu-slots{padding:0;list-style:none;min-height:60px}.fu-slot .kc-img{width:40px;height:32px}
.fu-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;list-style:none;padding:0}
.pick{position:relative}.pick-hit{position:absolute;inset:0;opacity:0}.kc-img{width:100%;height:80px}
</style></head><body><main class="fu-screen">
<div class="fu-recipes"></div>
<section class="fu-tray"><ol class="fu-slots"></ol><div class="fu-copies"></div><div class="fu-tools"><button type="button" class="chip-btn" disabled>Clear</button></div><div class="fu-bar"><button type="button">Fuse</button></div></section>
<section class="fu-pick"><div data-testid="fusion-filters"><label>Search <input type="search"></label></div><ul class="fu-grid" aria-busy="true"></ul><div class="center"></div></section>
</main><script>
const grid = document.querySelector('.fu-grid'), tray = document.querySelector('.fu-slots'), menus = document.querySelector('.fu-copies');
const clear = document.querySelector('.fu-tools button'), search = document.querySelector('input');
const pages = new Map(), choices = new Map(), selected = new Map();
let rarity, recipes, maxBatches, generation = 0, debounce;
const face = (id) => '<article class="kc-article"><div class="kc"><h3 class="kc-name">Card '+id+'</h3><img class="kc-img" src="/media/cards/'+id+'/x/card.webp"></div></article>';
function drawTray() {
  tray.replaceChildren(); menus.replaceChildren();
  for (const [id, picks] of selected) {
    const available = choices.get(id) || [];
    picks.forEach((copy, index) => {
      const slot = document.createElement('li');
      slot.className = 'fu-slot fu-slot-on';
      slot.dataset.subject = id;
      if (copy) slot.dataset.copy = copy;
      slot.innerHTML = '<button type="button" class="fu-slot-btn">'+face(id)+'</button>';
      slot.firstChild.onclick = () => { picks.splice(index, 1); if (!picks.length) selected.delete(id); drawTray(); };
      tray.append(slot);
      if (available.length <= picks.length) return;
      const label = document.createElement('label');
      label.className = 'fu-copy';
      label.innerHTML = '<span class="mk-sort-pre">Card '+id+'</span><span></span><select data-testid="fusion-copy"></select>';
      const select = label.querySelector('select');
      available.filter(item => item.id === copy || !picks.includes(item.id)).forEach(item => {
        select.add(new Option(item.numberOne ? '#1' : item.id.slice(-2), item.id));
      });
      select.value = copy;
      label.children[1].textContent = select.selectedOptions[0]?.textContent;
      select.onchange = () => { picks[index] = select.value; drawTray(); };
      menus.append(label);
    });
  }
  clear.disabled = !selected.size;
}
async function pick(entry) {
  const id = entry.card.subjectId, picks = selected.get(id) || [];
  const capacity = recipes.find(recipe => recipe.from === rarity).cards * maxBatches;
  if ([...selected.values()].reduce((count, picks) => count + picks.length, 0) >= capacity) return;
  if (picks.length >= entry.usable) { selected.delete(id); drawTray(); return; }
  const multiple = entry.usable > 1 || entry.quantity > entry.usable || entry.card.numberOne;
  const available = choices.get(id);
  picks.push(available?.find(copy => !picks.includes(copy.id))?.id || null);
  selected.set(id, picks);
  drawTray();
  if (multiple && !available) {
    const { copies } = await fetch('/api/fusion/copies?subject='+id).then(res => res.json());
    choices.set(id, copies);
    if (selected.get(id) === picks) {
      for (let index = 0; index < picks.length; index++)
        if (!picks[index]) picks[index] = copies.find(copy => !picks.includes(copy.id))?.id;
      drawTray();
    }
  }
}
async function load(cursor) {
  const version = ++generation;
  const more = document.querySelector('.center');
  more.replaceChildren(); grid.setAttribute('aria-busy', 'true');
  if (!cursor) { grid.replaceChildren(); pages.clear(); }
  const query = new URLSearchParams({ rarity, limit: '60' });
  if (cursor) query.set('cursor', cursor);
  if (search.value) query.set('q', search.value);
  const data = await fetch('/api/fusion/cards?'+query).then(res => res.json());
  if (generation !== version) return;
  for (const entry of data.items) {
    const id = entry.card.subjectId;
    if (pages.has(id)) continue;
    pages.set(id, entry);
    const li = document.createElement('li');
    li.innerHTML = '<div class="pick" data-id="'+id+'">'+face(id)+'<button class="pick-hit" aria-label="Add '+id+'"></button></div>';
    li.querySelector('button').onclick = () => void pick(entry);
    grid.append(li);
  }
  if (data.nextCursor) {
    const button = document.createElement('button');
    button.className = 'btn-outline'; button.textContent = 'Load more';
    button.onclick = () => void load(data.nextCursor); more.append(button);
  }
  grid.setAttribute('aria-busy', 'false');
}
clear.onclick = () => { selected.clear(); drawTray(); };
document.querySelector('.fu-bar button').onclick = () => fetch('/api/fusion', { method: 'POST' });
search.oninput = () => { clearTimeout(debounce); debounce = setTimeout(() => void load(), 300); };
fetch('/api/fusion').then(res => res.json()).then((rules) => {
  ({ recipes, maxBatches } = rules);
  rarity = recipes[0].from;
  const radios = document.querySelector('.fu-recipes');
  for (const { from } of recipes) {
    const radio = document.createElement('button');
    radio.className = 'fu-recipe fu-r-' + from.toLowerCase();
    radio.setAttribute('role', 'radio');
    radio.setAttribute('aria-checked', String(from === rarity));
    radio.textContent = from;
    radio.onclick = () => {
      if (rarity === from) return;
      for (const other of radios.children) other.setAttribute('aria-checked', String(radio === other));
      rarity = from; selected.clear(); search.value = ''; drawTray(); void load();
    };
    radios.append(radio);
  }
  return load();
});
</script></body></html>`;
}
