import "./options.css";
import { button, el, note } from "../content/ui";
import { readSettings, saveSettings, defaults } from "../shared/settings";
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
const status = el("p", "status");
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
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
app.append(general);
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
app.append(grid);
const save = button("Save settings", () => void persist(), "primary"),
  cancel = button(
    "Cancel changes",
    () => {
      draft = structuredClone(saved);
      renderSettings();
      renderAlbums();
      status.textContent = "Unsaved changes discarded.";
    },
    "ghost",
  );
const savebar = el("div", "savebar"),
  saveActions = el("div", "save-actions");
saveActions.append(cancel, save);
savebar.append(status, saveActions);
app.append(
  savebar,
  el(
    "p",
    "bottom",
    "KosMore 0.1 · Settings stay in this browser. Card and market data come from Kosmora.",
  ),
);
function renderSettings() {
  enabled.checked = draft.enabled;
  delay.value = String(draft.hoverDelayMs);
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
async function persist() {
  if (busy) return;
  if (
    !Number.isInteger(draft.hoverDelayMs) ||
    draft.hoverDelayMs < 100 ||
    draft.hoverDelayMs > 2000
  ) {
    status.textContent = "Choose a hover delay from 100 to 2,000 milliseconds.";
    delay.focus();
    return;
  }
  busy = true;
  save.disabled = true;
  try {
    await saveSettings(draft);
    saved = structuredClone(draft);
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
    status.textContent = messageOf(error);
  });
