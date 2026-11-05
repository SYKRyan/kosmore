import "./options.css";
import "../content/stat-box.css";
import { StatSettings } from "./stat-settings";
import { HotkeySettings } from "./hotkey-settings";
import { hotkeyConflict } from "../shared/hotkeys";
import { button, el, note } from "../content/ui";
import {
  readSettings,
  saveSettings,
  defaults,
  parseSettings,
  SETTINGS_KEY,
} from "../shared/settings";
import { request, type Session } from "../shared/messages";
import { messageOf, type Album, type Settings } from "../shared/types";
const app = document.getElementById("app")!;
let saved: Settings = defaults(),
  draft: Settings = defaults(),
  sessions: Session[] = [],
  selected: Session | undefined,
  albums: Album[] = [],
  filter = "",
  sequence = 0,
  busy = false;
const header = el("header", "header"),
  head = el("div");
head.append(
  el("p", "brand", "✦ KosMore"),
  el("h1", "", "A little more Kosmora."),
  el(
    "p",
    "intro",
    "Card insights when you need them. Your favourite albums, one click away.",
  ),
);
header.append(head, el("span", "badge", "LOCAL BROWSER SETTINGS"));
app.append(header);
const general = el("section", "panel");
general.append(el("h2", "", "Hover companion"));
const enabled = el("input");
enabled.type = "checkbox";
enabled.id = "enabled";
const toggle = el("label", "label settings-toggle", "Enable card hover popups");
toggle.prepend(enabled);
const enabledRow = el("div", "row");
enabledRow.append(
  toggle,
  el("span", "hint", "Across Kosmora, including pack openings"),
);
general.append(el("div", "rule"), enabledRow, el("div", "rule"));
const delayRow = el("div", "row"),
  delayInfo = el("div");
const delayLabel = el("label", "", "Hover delay");
delayLabel.htmlFor = "hover-delay";
delayInfo.append(
  delayLabel,
  el("p", "sub", "Milliseconds before a card popup appears (100–2,000)."),
);
const delay = el("input");
delay.type = "number";
delay.id = "hover-delay";
delay.min = "100";
delay.max = "2000";
delay.step = "50";
delayRow.append(delayInfo, delay);
general.append(delayRow);
const popupInputs = (
  [
    [
      "dismissDelayMs",
      "Dismiss delay",
      "Milliseconds after leaving the card and popup (0–30,000). Pinned popups stay open.",
      0,
      30000,
      50,
    ],
    [
      "popupWidth",
      "Popup width",
      "Width in pixels (320–1,200), limited to fit your screen.",
      320,
      1200,
      10,
    ],
    [
      "popupHeight",
      "Popup height",
      "Height in pixels (480–1,600), limited to fit your screen.",
      480,
      1600,
      10,
    ],
  ] as const
).map(([field, title, hint, min, max, step]) => {
  const row = el("div", "row"),
    info = el("div"),
    label = el("label", "", title),
    input = el("input");
  input.type = "number";
  input.id = field;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  label.htmlFor = input.id;
  info.append(label, el("p", "sub", hint));
  row.append(info, input);
  general.append(el("div", "rule"), row);
  input.addEventListener("input", () => {
    draft[field] = input.value === "" ? NaN : Number(input.value);
  });
  return { field, input, title, min, max };
});
general.append(
  el(
    "p",
    "sub",
    "Pin to keep the popup open across pages in this tab. Drag the header to move it, or any edge or corner to resize. Position and size save automatically. New pages show No Card Selected until you hover a card. Unpin to open beside cards again.",
  ),
);
app.append(general);
const hotkeySettings = new HotkeySettings((hotkeys) => {
  draft.hotkeys = hotkeys;
});
app.append(hotkeySettings.host);
const overlays = el("section", "panel");
overlays.append(
  el("h2", "", "Card overlays"),
  el(
    "p",
    "sub",
    "Indicators on visible cards and in popup headers. These work independently of hover popups.",
  ),
);
function overlayToggle(
  id: string,
  label: string,
  hint: string,
  update: (checked: boolean) => void,
) {
  const row = el("div", "row"),
    input = el("input"),
    text = el("label", "label settings-toggle", label);
  input.type = "checkbox";
  input.id = id;
  text.prepend(input);
  row.append(text, el("span", "hint", hint));
  input.addEventListener("change", () => update(input.checked));
  overlays.append(el("div", "rule"), row);
  return input;
}
const saleOverlay = overlayToggle(
  "sale-history-overlay",
  "Show sale history icon on cards",
  "Gavel · completed sales in the last 30 days",
  (checked) => {
    draft.showSaleHistoryOverlay = checked;
  },
);
const friendOverlay = overlayToggle(
  "friend-interest-overlay",
  "Show interested friends icon on cards",
  "Friends · matching saved family preferences",
  (checked) => {
    draft.showFriendInterestOverlay = checked;
  },
);
const questOverlay = overlayToggle(
  "quest-overlay",
  "Show quest icon on cards",
  "Quest · belongs to any quest, followed or not",
  (checked) => {
    draft.showQuestOverlay = checked;
  },
);
app.append(overlays);
const statSettings = new StatSettings((preferences) => {
  draft.stats = preferences;
  statSettings.render(draft.stats);
});
app.append(statSettings.host);
enabled.addEventListener("change", () => {
  draft.enabled = enabled.checked;
});
delay.addEventListener("input", () => {
  draft.hoverDelayMs = Number(delay.value);
});
const connection = el("section", "panel"),
  accountRow = el("div", "account-row"),
  select = el("select");
select.setAttribute("aria-label", "Kosmora account");
connection.append(
  el("h2", "", "Connected account"),
  el(
    "p",
    "sub",
    "Pinned albums belong to the selected Kosmora account. Keep a signed-in game tab open.",
  ),
);
accountRow.style.marginTop = "14px";
const refresh = button(
  "Refresh accounts",
  () => void discover(),
  "ghost small",
);
accountRow.append(select, refresh);
connection.append(accountRow);
const connectionStatus = el("div");
connection.append(connectionStatus);
app.append(connection);
const grid = el("div", "grid"),
  catalogPanel = el("section", "panel"),
  pinnedPanel = el("section", "panel");
const catalogHeader = el("div", "section-top");
catalogHeader.append(el("h2", "", "Your albums"));
catalogPanel.append(catalogHeader);
const search = el("input");
search.type = "search";
search.placeholder = "Find an album…";
search.setAttribute("aria-label", "Search albums");
search.addEventListener("input", () => {
  filter = search.value;
  renderAlbums();
});
catalogPanel.append(search);
const catalog = el("div", "album-list"),
  pins = el("div", "pin-list");
catalogPanel.append(catalog);
pinnedPanel.append(
  el("h2", "", "Pinned shortcuts"),
  el("p", "sub", "Buttons appear in this order in the card popup."),
  pins,
);
grid.append(catalogPanel, pinnedPanel);
grid.style.marginTop = "18px";
connection.append(grid);
type SettingsGroup = {
  host: HTMLElement;
  name: string;
  keys: (keyof Settings)[];
  validate?: () => string | undefined;
  render: () => void;
};
function groupControls(group: SettingsGroup) {
  group.host.setAttribute("aria-label", group.name);
  const status = el("p", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const save = button(
    `Save ${group.name}`,
    () => void persist(group, status, save),
    "primary",
  );
  const cancel = button(
    `Cancel ${group.name} changes`,
    () => {
      for (const key of group.keys)
        Object.assign(draft, { [key]: structuredClone(saved[key]) });
      group.render();
      status.textContent = "Unsaved changes discarded.";
    },
    "ghost",
  );
  const bar = el("div", "savebar"),
    actions = el("div", "save-actions");
  actions.append(cancel, save);
  bar.append(status, actions);
  group.host.append(bar);
}
groupControls({
  host: general,
  name: "popup settings",
  keys: [
    "enabled",
    "hoverDelayMs",
    "dismissDelayMs",
    "popupWidth",
    "popupHeight",
  ],
  render: renderSettings,
  validate: () => {
    for (const { field, input, title, min, max } of popupInputs) {
      if (
        !Number.isInteger(draft[field]) ||
        draft[field] < min ||
        draft[field] > max
      ) {
        input.focus();
        return `Choose a ${title.toLowerCase()} from ${min.toLocaleString()} to ${max.toLocaleString()}.`;
      }
    }
    if (
      !Number.isInteger(draft.hoverDelayMs) ||
      draft.hoverDelayMs < 100 ||
      draft.hoverDelayMs > 2000
    ) {
      delay.focus();
      return "Choose a hover delay from 100 to 2,000 milliseconds.";
    }
  },
});
groupControls({
  host: hotkeySettings.host,
  name: "hotkeys",
  keys: ["hotkeys"],
  render: () => hotkeySettings.render(draft.hotkeys),
  validate: () => hotkeyConflict(draft.hotkeys),
});
groupControls({
  host: overlays,
  name: "overlay settings",
  keys: [
    "showSaleHistoryOverlay",
    "showFriendInterestOverlay",
    "showQuestOverlay",
  ],
  render: renderSettings,
});
groupControls({
  host: statSettings.host,
  name: "stat layout",
  keys: ["stats"],
  render: () => statSettings.render(draft.stats),
});
groupControls({
  host: connection,
  name: "album shortcuts",
  keys: ["pinnedAlbums"],
  render: renderAlbums,
});
app.append(
  el(
    "p",
    "bottom",
    "KosMore 0.2.1 · Settings stay in this browser. Card and market data come from Kosmora.",
  ),
);
function renderSettings() {
  enabled.checked = draft.enabled;
  delay.value = String(draft.hoverDelayMs);
  for (const { field, input } of popupInputs)
    input.value = String(draft[field]);
  saleOverlay.checked = draft.showSaleHistoryOverlay;
  friendOverlay.checked = draft.showFriendInterestOverlay;
  questOverlay.checked = draft.showQuestOverlay;
  statSettings.render(draft.stats);
  hotkeySettings.render(draft.hotkeys);
}
function pinned() {
  return selected ? (draft.pinnedAlbums[selected.account.key] ?? []) : [];
}
function setPins(ids: string[]) {
  if (selected) draft.pinnedAlbums[selected.account.key] = ids;
  renderAlbums();
}
function renderAlbums() {
  const ids = pinned();
  catalog.replaceChildren();
  pins.replaceChildren();
  if (!selected) {
    catalog.append(
      el("p", "empty", "Connect a signed-in Kosmora tab to see your albums."),
    );
    pins.append(el("p", "empty", "Your pinned albums will appear here."));
    return;
  }
  for (const album of albums.filter((a) =>
    a.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  )) {
    const row = el("div", "album-row"),
      meta = el("div");
    meta.append(
      el("div", "album-name", album.name),
      el("div", "album-count", `${album.items.toLocaleString()} cards`),
    );
    const isPinned = ids.includes(album.id);
    const pin = button(
      isPinned ? "Unpin" : "Pin",
      () =>
        setPins(
          isPinned ? ids.filter((id) => id !== album.id) : [...ids, album.id],
        ),
      "small ghost",
    );
    pin.setAttribute(
      "aria-label",
      `${isPinned ? "Unpin" : "Pin"} ${album.name}`,
    );
    row.append(meta, pin);
    catalog.append(row);
  }
  if (!catalog.children.length)
    catalog.append(
      el(
        "p",
        "empty",
        albums.length
          ? "No albums match your search."
          : "No albums are available for this account.",
      ),
    );
  ids.forEach((id, index) => {
    const album = albums.find((a) => a.id === id),
      row = el("div", "album-row"),
      name = el("div", "album-name");
    name.append(
      el("span", "rank", String(index + 1).padStart(2, "0")),
      document.createTextNode(album?.name ?? "Unavailable album"),
    );
    const actions = el("div", "album-actions");
    for (const [delta, symbol, label] of [
      [-1, "↑", "Move up"],
      [1, "↓", "Move down"],
    ] as const) {
      const b = button(
        symbol,
        () => {
          const reordered = [...ids];
          [reordered[index], reordered[index + delta]] = [
            reordered[index + delta],
            reordered[index],
          ];
          setPins(reordered);
        },
        "small ghost",
      );
      b.disabled = index + delta < 0 || index + delta >= ids.length;
      b.setAttribute(
        "aria-label",
        `${label} ${album?.name ?? "unavailable album"}`,
      );
      actions.append(b);
    }
    const remove = button(
      "×",
      () => setPins(ids.filter((x) => x !== id)),
      "small ghost",
    );
    remove.setAttribute(
      "aria-label",
      `Unpin ${album?.name ?? "unavailable album"}`,
    );
    actions.append(remove);
    row.append(name, actions);
    pins.append(row);
  });
  if (!ids.length)
    pins.append(
      el("p", "empty", "Pin an album on the left to add a shortcut."),
    );
}
async function discover() {
  const n = ++sequence;
  refresh.disabled = true;
  connectionStatus.replaceChildren(note("Finding signed-in game tabs…"));
  try {
    const found = await request<Session[]>({ op: "sessions" });
    if (n !== sequence) return;
    sessions = [...new Map(found.map((s) => [s.account.key, s])).values()];
    select.replaceChildren();
    const prompt = el(
      "option",
      "",
      sessions.length ? "Choose an account…" : "No signed-in game tab",
    );
    prompt.value = "";
    select.append(prompt);
    for (const s of sessions) {
      const o = el("option", "", s.account.handle);
      o.value = s.account.key;
      select.append(o);
    }
    const old = selected?.account.key;
    selected = old
      ? sessions.find((s) => s.account.key === old)
      : sessions.length === 1
        ? sessions[0]
        : undefined;
    select.value = selected?.account.key ?? "";
    connectionStatus.replaceChildren();
    if (!sessions.length) {
      connectionStatus.append(
        note("Open Kosmora, sign in, then refresh accounts."),
      );
      const a = el("a", "", "Open Kosmora");
      a.href = "https://kosmora.io/home";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      connectionStatus.append(a);
    } else if (!selected)
      connectionStatus.append(
        note("Choose the account whose pinned albums you want to configure."),
      );
    albums = [];
    renderAlbums();
    if (selected) await loadAlbums();
  } catch (error) {
    connectionStatus.replaceChildren(note(messageOf(error), true));
  } finally {
    refresh.disabled = false;
  }
}
async function loadAlbums() {
  const n = ++sequence;
  const session = selected;
  if (!session) return;
  connectionStatus.replaceChildren(note("Loading your albums…"));
  try {
    const list = await request<Album[]>({
      op: "albums",
      tabId: session.tabId,
      accountKey: session.account.key,
    });
    if (n !== sequence) return;
    albums = list;
    connectionStatus.replaceChildren(
      note(`Connected to ${session.account.handle}.`),
    );
    renderAlbums();
  } catch (error) {
    if (n === sequence) {
      albums = [];
      renderAlbums();
      connectionStatus.replaceChildren(note(messageOf(error), true));
    }
  }
}
select.addEventListener("change", () => {
  sequence++;
  selected = sessions.find((s) => s.account.key === select.value);
  albums = [];
  renderAlbums();
  if (selected) void loadAlbums();
});
async function persist(
  group: SettingsGroup,
  status: HTMLElement,
  save: HTMLButtonElement,
) {
  if (busy) return;
  const error = group.validate?.();
  if (error) {
    status.className = "status error";
    status.textContent = error;
    return;
  }
  busy = true;
  save.disabled = true;
  const values = Object.fromEntries(
    group.keys.map((key) => [key, structuredClone(draft[key])]),
  );
  try {
    const next = await readSettings();
    Object.assign(next, values);
    await saveSettings(next);
    for (const key of group.keys)
      Object.assign(saved, { [key]: structuredClone(next[key]) });
    status.className = "status success";
    status.textContent = "Saved. Changes apply to open Kosmora tabs.";
  } catch (error) {
    status.className = "status error";
    status.textContent = messageOf(error);
  } finally {
    busy = false;
    save.disabled = false;
  }
}
void readSettings()
  .then((s) => {
    saved = s;
    draft = structuredClone(s);
    renderSettings();
    renderAlbums();
    return discover();
  })
  .catch((error) => {
    app.append(note(`Could not load settings: ${messageOf(error)}`, true));
  });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) return;
  const next = parseSettings(changes[SETTINGS_KEY].newValue);
  for (const { field, input } of popupInputs) {
    if (field !== "popupWidth" && field !== "popupHeight") continue;
    if (draft[field] === saved[field]) {
      draft[field] = next[field];
      input.value = String(next[field]);
    }
    saved[field] = next[field];
  }
  saved.popupPosition = next.popupPosition;
  draft.popupPosition = next.popupPosition;
});
