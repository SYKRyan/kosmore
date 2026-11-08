import "./options.css";
import "../content/stat-box.css";
import { StatSettings } from "./stat-settings";
import { HotkeySettings } from "./hotkey-settings";
import { settingsNavigation } from "./settings-navigation";
import { SalesSettings, SALES_SETTINGS_KEYS } from "./sales-settings";
import { BackupSettings } from "./backup-settings";
import { TradeSettings, TRADE_SETTINGS_KEYS } from "./trade-settings";
import { FamilyBlacklistSettings } from "./family-blacklist-settings";
import type { FamilyChoice } from "../kosmora/families";
import {
  FriendTooltipSettings,
  FRIEND_TOOLTIP_KEYS,
} from "./friend-tooltip-settings";
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
type FeatureKey =
  | "enabled"
  | "profileRemindersEnabled"
  | "tradeRemindersEnabled"
  | "friendTooltipEnabled"
  | "navigationHotkeysEnabled"
  | "cardOverlaysEnabled"
  | "familyImpactOverlaysEnabled"
  | "salesOverlaysEnabled"
  | "statBoxesEnabled"
  | "pinnedAlbumsEnabled";
const featureGroups = new Map<
  HTMLElement,
  { key: FeatureKey; input: HTMLInputElement }
>();
const savingGroups = new Set<HTMLElement>();
let settingsWrites: Promise<unknown> = Promise.resolve();
function queueSettingsWrite<T>(write: () => Promise<T>): Promise<T> {
  const result = settingsWrites.then(write);
  settingsWrites = result.catch(() => {});
  return result;
}
let saved: Settings = defaults(),
  draft: Settings = defaults(),
  sessions: Session[] = [],
  selected: Session | undefined,
  albums: Album[] = [],
  filter = "",
  sequence = 0,
  busy = false,
  settingsReady = false;
const header = el("header", "header"),
  head = el("div");
head.append(el("p", "brand", "✦ KosMore"), el("h1", "", "More Kosmora"));
header.append(head, el("span", "badge", "LOCAL BROWSER SETTINGS"));
app.append(header);
const general = el("section", "panel");
general.append(el("h2", "", "Hover Tooltip"));
general.append(
  el(
    "p",
    "sub",
    "Pin to keep the tooltip open across pages in this tab. Drag the header to move it, or any edge or corner to resize. Position and size save automatically. New pages show No Card Selected until you hover a card or press its overlay button. Unpin to open beside cards again.",
  ),
);
const enabled = sectionToggle(general, "enabled", "Enable card hover tooltips");
const disableHoverInPulsar = pageExclusionToggle(
  general,
  "disableHoverTooltipInPulsar",
  "Hide card tooltips and their open buttons in Pulsar games, except Vortex.",
);
const disableHoverInVortex = pageExclusionToggle(
  general,
  "disableHoverTooltipInVortex",
  "Hide card tooltips and their open buttons in Vortex.",
  "Disable in Vortex",
);

function pageExclusionToggle(
  host: HTMLElement,
  key:
    | "disableHoverTooltipInPulsar"
    | "disableCardOverlaysInPulsar"
    | "disableHoverTooltipInVortex"
    | "disableCardOverlaysInVortex",
  hint: string,
  text = "Disable in Pulsar",
) {
  const row = el("div", "row"),
    input = el("input"),
    label = el("label", "label settings-toggle", text);
  input.type = "checkbox";
  input.id = key;
  label.prepend(input);
  row.append(label, el("span", "hint", hint));
  host.append(el("div", "rule"), row);
  input.addEventListener("change", () => {
    draft[key] = input.checked;
  });
  return input;
}
general.append(el("div", "rule"));
const mobileFriendly = el("fieldset", "settings-subgroup");
mobileFriendly.append(el("legend", "", "Mobile Friendly"));
const useOverlayButton = el("input");
useOverlayButton.type = "checkbox";
useOverlayButton.id = "use-overlay-button-instead-of-hover";
const useOverlayButtonLabel = el(
  "label",
  "label settings-toggle",
  "Use Overlay Button Instead of Hover",
);
useOverlayButtonLabel.prepend(useOverlayButton);
const useOverlayButtonRow = el("div", "row");
useOverlayButtonRow.append(
  useOverlayButtonLabel,
  el(
    "span",
    "hint",
    "Press the round Kosmora button at the bottom-left corner of a card to open its tooltip. Hover is disabled on cards showing the button. Tapped tooltips stay open until dismissed. Useful on touch screens.",
  ),
);
mobileFriendly.append(useOverlayButtonRow, el("div", "rule"));
useOverlayButton.addEventListener("change", () => {
  draft.useOverlayButtonInsteadOfHover = useOverlayButton.checked;
});
const outsideClickOnly = el("input");
outsideClickOnly.type = "checkbox";
outsideClickOnly.id = "outside-click-closes-tooltip-only";
const outsideClickLabel = el(
  "label",
  "label settings-toggle",
  "Outside Click Closes Tooltip Only",
);
outsideClickLabel.prepend(outsideClickOnly);
const outsideClickRow = el("div", "row");
outsideClickRow.append(
  outsideClickLabel,
  el(
    "span",
    "hint",
    "When the tooltip is unpinned, an outside click or tap closes it without opening a card, changing selection, or activating the control underneath. The next click works normally. Pinned tooltips keep their normal behavior.",
  ),
);
mobileFriendly.append(outsideClickRow, el("div", "rule"));
outsideClickOnly.addEventListener("change", () => {
  draft.outsideClickClosesTooltipOnly = outsideClickOnly.checked;
});
const fullScreenCentered = el("input");
fullScreenCentered.type = "checkbox";
fullScreenCentered.id = "full-screen-centered-on-open";
const fullScreenLabel = el(
  "label",
  "label settings-toggle",
  "Full Screen & Centered on Open",
);
fullScreenLabel.prepend(fullScreenCentered);
const fullScreenRow = el("div", "row");
fullScreenRow.append(
  fullScreenLabel,
  el(
    "span",
    "hint",
    "Open centered and fill the visible viewport, leaving a 24-pixel margin on every side for outside-click closing. Saved size and position apply again when turned off. Drag and resize are unavailable in this mode; pinned tooltips stay open.",
  ),
);
mobileFriendly.append(fullScreenRow);
fullScreenCentered.addEventListener("change", () => {
  draft.fullScreenCenteredOnOpen = fullScreenCentered.checked;
  syncTooltipSizing();
});
const closeAfterAlbumAdd = el("input");
closeAfterAlbumAdd.type = "checkbox";
closeAfterAlbumAdd.id = "close-tooltip-when-added-to-album";
const closeAfterAlbumLabel = el(
  "label",
  "label settings-toggle",
  "Close Unpinned Tooltips When Added to Album",
);
closeAfterAlbumLabel.prepend(closeAfterAlbumAdd);
const closeAfterAlbumRow = el("div", "row");
closeAfterAlbumRow.append(
  closeAfterAlbumLabel,
  el(
    "span",
    "hint",
    "Close unpinned tooltips after a successful album addition.",
  ),
);
const applyCloseToPinned = el("input");
applyCloseToPinned.type = "checkbox";
applyCloseToPinned.classList.add("section-switch");
applyCloseToPinned.setAttribute("role", "switch");
applyCloseToPinned.id = "apply-close-behavior-to-pinned-tooltips";
const applyCloseToPinnedLabel = el(
  "label",
  "label settings-toggle",
  "Also Close Pinned Tooltips",
);
applyCloseToPinnedLabel.prepend(applyCloseToPinned);
const applyCloseToPinnedRow = el("div", "row settings-subsetting");
applyCloseToPinnedRow.append(
  applyCloseToPinnedLabel,
  el("span", "hint", "Extend the same behavior to pinned tooltips."),
);
general.append(closeAfterAlbumRow, applyCloseToPinnedRow, el("div", "rule"));
closeAfterAlbumAdd.addEventListener("change", () => {
  draft.closeTooltipWhenAddedToAlbum = closeAfterAlbumAdd.checked;
  applyCloseToPinned.disabled = !closeAfterAlbumAdd.checked;
});
applyCloseToPinned.addEventListener("change", () => {
  draft.applyCloseBehaviorToPinnedTooltips = applyCloseToPinned.checked;
});
const delayRow = el("div", "row"),
  delayInfo = el("div");
const delayLabel = el("label", "", "Hover delay");
delayLabel.htmlFor = "hover-delay";
delayInfo.append(
  delayLabel,
  el("p", "sub", "Milliseconds before a card tooltip appears (100–2,000)."),
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
      "Milliseconds after leaving the card and tooltip (0–30,000). Pinned tooltips stay open.",
      0,
      30000,
      50,
    ],
    [
      "popupWidth",
      "Tooltip width",
      "Width in pixels (320–1,200), limited to fit your screen.",
      320,
      1200,
      10,
    ],
    [
      "popupHeight",
      "Tooltip height",
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
general.append(el("div", "rule"), mobileFriendly);
const hotkeySettings = new HotkeySettings((hotkeys) => {
  draft.hotkeys = hotkeys;
});
function syncTooltipSizing() {
  for (const { field, input } of popupInputs)
    if (field === "popupWidth" || field === "popupHeight")
      input.disabled = draft.fullScreenCenteredOnOpen;
}
function sectionToggle(host: HTMLElement, key: FeatureKey, label: string) {
  const heading = host.querySelector("h2")!;
  const row = el("div", "settings-group-heading"),
    input = el("input", "section-switch");
  input.type = "checkbox";
  input.id = key;
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", label);
  input.title = label;
  input.checked = draft[key];
  input.disabled = true;
  featureGroups.set(host, { key, input });
  input.addEventListener("change", () => {
    draft[key] = input.checked;
    void persistFeature(host);
  });
  heading.replaceWith(row);
  const state = el("span", "settings-group-state", "Disabled");
  state.hidden = input.checked;
  row.append(heading, state, input);
  return input;
}
function renderGroupState(host: HTMLElement) {
  const input = featureGroups.get(host)!.input;
  const disabled = !input.checked;
  const saving = savingGroups.has(host);
  input.disabled = !settingsReady || saving;
  host.classList.toggle("settings-group-disabled", disabled);
  const content = host.querySelector<HTMLFieldSetElement>(
    ":scope > .settings-group-content",
  );
  if (content) content.disabled = disabled || saving;
  for (const button of host.querySelectorAll<HTMLButtonElement>(
    ":scope > .savebar button",
  ))
    button.disabled = disabled || saving || !settingsReady;
  host.querySelector<HTMLElement>(".settings-group-state")!.hidden = !disabled;
}
const hotkeysEnabled = sectionToggle(
  hotkeySettings.host,
  "navigationHotkeysEnabled",
  "Enable navigation hotkey",
);
const friendTooltipSettings = new FriendTooltipSettings((update) =>
  Object.assign(draft, update),
);
const friendTooltipEnabled = sectionToggle(
  friendTooltipSettings.host,
  "friendTooltipEnabled",
  "Enable friend tooltip",
);
const profileSettings = el("section", "panel");
profileSettings.append(
  el("h2", "", "Profile Reminders"),
  el(
    "p",
    "sub",
    "Open KosMore above a player's profile header to edit the same private families and notes as Social. Pin the editor below the header and above Albums, with families on the left and notes on the right. These reminders stay in this browser.",
  ),
);
const profileEnabled = sectionToggle(
  profileSettings,
  "profileRemindersEnabled",
  "Enable profile reminders",
);
const profilePinned = el("input");
profilePinned.type = "checkbox";
profilePinned.id = "profile-reminders-pinned";
const profilePinLabel = el(
  "label",
  "label settings-toggle",
  "Keep reminders pinned on profiles",
);
profilePinLabel.prepend(profilePinned);
profileSettings.append(el("div", "rule"), profilePinLabel);
profilePinned.addEventListener("change", () => {
  draft.profileRemindersPinned = profilePinned.checked;
});
const tradeSettings = new TradeSettings((update) =>
  Object.assign(draft, update),
);
const tradeEnabled = sectionToggle(
  tradeSettings.host,
  "tradeRemindersEnabled",
  "Enable trade reminders",
);
const overlays = el("section", "panel");
overlays.append(
  el("h2", "", "Card Overlays"),
  el(
    "p",
    "sub",
    "Indicators on visible cards and in tooltip headers. These work independently of hover tooltips.",
  ),
);
const overlaysEnabled = sectionToggle(
  overlays,
  "cardOverlaysEnabled",
  "Enable card overlays",
);
const disableOverlaysInPulsar = pageExclusionToggle(
  overlays,
  "disableCardOverlaysInPulsar",
  "Hide card indicators and tooltip header indicators in Pulsar games, except Vortex.",
);
const disableOverlaysInVortex = pageExclusionToggle(
  overlays,
  "disableCardOverlaysInVortex",
  "Hide card indicators and tooltip header indicators in Vortex.",
  "Disable in Vortex",
);
function overlayToggle(
  id: string,
  label: string,
  hint: string,
  update: (checked: boolean) => void,
  host: HTMLElement = overlays,
) {
  const row = el("div", "row"),
    input = el("input"),
    text = el("label", "label settings-toggle", label);
  input.type = "checkbox";
  input.id = id;
  text.prepend(input);
  row.append(text, el("span", "hint", hint));
  input.addEventListener("change", () => update(input.checked));
  host.append(el("div", "rule"), row);
  return input;
}
function overlayPriceToggle(
  parent: HTMLInputElement,
  id: string,
  label: string,
  hint: string,
  update: (checked: boolean) => void,
) {
  const row = el("div", "row settings-subsetting"),
    input = el("input", "section-switch price-switch"),
    text = el("label", "label settings-toggle", label);
  input.type = "checkbox";
  input.id = id;
  input.setAttribute("role", "switch");
  text.prepend(input);
  row.append(text, el("span", "hint", hint));
  parent.addEventListener("change", () => {
    input.disabled = !parent.checked;
  });
  input.addEventListener("change", () => update(input.checked));
  overlays.append(row);
  return input;
}
const auctionOverlay = overlayToggle(
  "active-auctions-overlay",
  "Show active auctions icon on cards",
  "Red sale tag · current listings at the top right",
  (checked) => {
    draft.showActiveAuctionsOverlay = checked;
  },
);
const listingPriceOverlay = overlayPriceToggle(
  auctionOverlay,
  "lowest-listing-price-overlay",
  "Show lowest listed price",
  "Lowest current listing price across all finishes: highest bid, or starting price when there are no bids.",
  (checked) => {
    draft.showLowestListingPriceOverlay = checked;
  },
);
const onSaleOverlay = overlayToggle(
  "on-sale-overlay",
  "Show For Sale label on cards",
  "Black and white label · you have a copy listed on the market",
  (checked) => {
    draft.showOnSaleOverlay = checked;
  },
);
const saleOverlay = overlayToggle(
  "sale-history-overlay",
  "Show sale history icon on cards",
  "Gavel · final sale prices in the last 30 days, at the top right",
  (checked) => {
    draft.showSaleHistoryOverlay = checked;
  },
);
const lastSalePriceOverlay = overlayPriceToggle(
  saleOverlay,
  "last-sale-price-overlay",
  "Show last sale price",
  "Last sale price across all finishes in Kosmora’s 30-day history.",
  (checked) => {
    draft.showLastSalePriceOverlay = checked;
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
const familyImpact = el("section", "panel");
familyImpact.append(
  el("h2", "", "Family Impact Overlay"),
  el(
    "p",
    "sub",
    "Check whether losing the chosen cards would lower a family tier. These checks work independently of card and sales overlays.",
  ),
);
const familyImpactEnabled = sectionToggle(
  familyImpact,
  "familyImpactOverlaysEnabled",
  "Enable family impact overlays",
);
const fusionFamilyOverlay = overlayToggle(
  "fusion-family-overlay",
  "Show family impact on the Fusion page",
  "Bottom left of each card, counting cards already chosen · ✓ Safe: no family loses a tier · ⚠ Loses: fusing it drops its family a tier",
  (checked) => {
    draft.showFusionFamilyOverlay = checked;
  },
  familyImpact,
);
const tradeFamilyOverlay = overlayToggle(
  "trade-family-overlay",
  "Show family impact on the Trade page",
  "Bottom left of your card choices · ✓ Safe: you keep every family tier · ⚠ Loses: trading your last copy drops a family tier. Uses the same family checks as Fusion.",
  (checked) => {
    draft.showTradeFamilyOverlay = checked;
  },
  familyImpact,
);
const vortexFamilyOverlay = overlayToggle(
  "vortex-family-overlay",
  "Show family impact on the Vortex page",
  "Bottom left of your stake cards and card picker · ✓ Safe: losing one copy keeps every family tier · ⚠ Loses: losing your last copy drops a family tier.",
  (checked) => {
    draft.showVortexFamilyOverlay = checked;
  },
  familyImpact,
);
const salesFamilyOverlay = overlayToggle(
  "sales-family-overlay",
  "Show on sale screens",
  "Check the whole selection as you pick cards in Sell Many, then show impact beneath each sale listing. Removing a listing recalculates the remaining batch.",
  (checked) => {
    draft.showSalesFamilyOverlay = checked;
  },
  familyImpact,
);
const familyBlacklistSettings = new FamilyBlacklistSettings(
  (update) => Object.assign(draft, update),
  async () => {
    const session =
      selected ??
      sessions[0] ??
      (await request<Session[]>({ op: "sessions" }))[0];
    if (!session)
      throw new Error("Open a signed-in Kosmora tab, then retry families.");
    return request<FamilyChoice[]>({
      op: "families",
      tabId: session.tabId,
      accountKey: session.account.key,
    });
  },
);
familyImpact.append(el("div", "rule"), familyBlacklistSettings.host);
const salesSettings = new SalesSettings((update) =>
  Object.assign(draft, update),
);
const salesEnabled = sectionToggle(
  salesSettings.host,
  "salesOverlaysEnabled",
  "Enable sales overlay",
);
const statSettings = new StatSettings((preferences) => {
  draft.stats = preferences;
  statSettings.render(draft.stats);
});
const statsEnabled = sectionToggle(
  statSettings.host,
  "statBoxesEnabled",
  "Enable stat boxes",
);
delay.addEventListener("input", () => {
  draft.hoverDelayMs = Number(delay.value);
});
const connection = el("section", "panel"),
  accountRow = el("div", "account-row"),
  select = el("select");
select.setAttribute("aria-label", "Kosmora account");
connection.append(
  el("h2", "", "Connected Account"),
  el(
    "p",
    "sub",
    "Select the Kosmora account used for pinned albums. Keep a signed-in game tab open.",
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
connection.setAttribute("aria-label", "connected account");
const albumSettings = el("section", "panel");
albumSettings.append(
  el("h2", "", "Pinned Albums"),
  el(
    "p",
    "sub",
    "Choose the albums that appear as shortcuts in the card tooltip.",
  ),
);
const albumsEnabled = sectionToggle(
  albumSettings,
  "pinnedAlbumsEnabled",
  "Enable pinned albums",
);
const albumAccount = el("p", "sub album-account");
albumSettings.append(albumAccount);
const grid = el("div", "grid"),
  catalogPanel = el("section", "panel"),
  pinnedPanel = el("section", "panel");
const catalogHeader = el("div", "section-top");
catalogHeader.append(el("h2", "", "Your Albums"));
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
  el("h2", "", "Pinned Shortcuts"),
  el("p", "sub", "Buttons appear in this order in the card tooltip."),
  pins,
);
grid.append(catalogPanel, pinnedPanel);
grid.style.marginTop = "18px";
albumSettings.append(grid);
type SettingsGroup = {
  host: HTMLElement;
  name: string;
  keys: (keyof Settings)[];
  validate?: () => string | undefined;
  render: () => void;
};
function groupControls(group: SettingsGroup) {
  group.host.setAttribute("aria-label", group.name);
  const content = el("fieldset", "settings-group-content");
  content.setAttribute("aria-label", `${group.name} options`);
  for (const child of [...group.host.children])
    if (!child.classList.contains("settings-group-heading"))
      content.append(child);
  group.host.append(content);
  renderGroupState(group.host);
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
      renderGroupState(group.host);
      status.textContent = "Unsaved changes discarded.";
    },
    "ghost",
  );
  const bar = el("div", "savebar"),
    actions = el("div", "save-actions");
  actions.append(cancel, save);
  bar.append(status, actions);
  group.host.append(bar);
  renderGroupState(group.host);
}
groupControls({
  host: general,
  name: "tooltip settings",
  keys: [
    "disableHoverTooltipInPulsar",
    "disableHoverTooltipInVortex",
    "enabled",
    "useOverlayButtonInsteadOfHover",
    "outsideClickClosesTooltipOnly",
    "fullScreenCenteredOnOpen",
    "closeTooltipWhenAddedToAlbum",
    "applyCloseBehaviorToPinnedTooltips",
    "hoverDelayMs",
    "dismissDelayMs",
    "popupWidth",
    "popupHeight",
  ],
  render: renderSettings,
  validate: () => {
    for (const { field, input, title, min, max } of popupInputs) {
      if (
        draft.fullScreenCenteredOnOpen &&
        (field === "popupWidth" || field === "popupHeight")
      )
        continue;
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
  keys: ["navigationHotkeysEnabled", "hotkeys"],
  render: renderSettings,
  validate: () => hotkeyConflict(draft.hotkeys),
});
groupControls({
  host: friendTooltipSettings.host,
  name: "friend tooltip settings",
  keys: [...FRIEND_TOOLTIP_KEYS],
  render: renderSettings,
  validate: () => friendTooltipSettings.validate(draft),
});
groupControls({
  host: profileSettings,
  name: "profile reminder settings",
  keys: ["profileRemindersEnabled", "profileRemindersPinned"],
  render: renderSettings,
});
groupControls({
  host: tradeSettings.host,
  name: "trade reminder settings",
  keys: [...TRADE_SETTINGS_KEYS],
  render: renderSettings,
  validate: () => tradeSettings.validate(draft),
});
groupControls({
  host: overlays,
  name: "overlay settings",
  keys: [
    "disableCardOverlaysInPulsar",
    "disableCardOverlaysInVortex",
    "cardOverlaysEnabled",
    "showSaleHistoryOverlay",
    "showLastSalePriceOverlay",
    "showActiveAuctionsOverlay",
    "showLowestListingPriceOverlay",
    "showOnSaleOverlay",
    "showFriendInterestOverlay",
    "showQuestOverlay",
  ],
  render: renderSettings,
});
groupControls({
  host: familyImpact,
  name: "family impact settings",
  keys: [
    "familyImpactOverlaysEnabled",
    "useFamilyBlacklist",
    "familyBlacklist",
    "showSalesFamilyOverlay",
    "showFusionFamilyOverlay",
    "showTradeFamilyOverlay",
    "showVortexFamilyOverlay",
  ],
  render: () => {
    familyBlacklistSettings.resetInput();
    renderSettings();
  },
  validate: () => familyBlacklistSettings.validate(draft),
});
groupControls({
  host: statSettings.host,
  name: "stat layout",
  keys: ["statBoxesEnabled", "stats"],
  render: renderSettings,
});
groupControls({
  host: salesSettings.host,
  name: "sales overlay settings",
  keys: [...SALES_SETTINGS_KEYS],
  render: renderSettings,
  validate: () => salesSettings.validate(draft),
});
groupControls({
  host: albumSettings,
  name: "album shortcuts",
  keys: ["pinnedAlbumsEnabled", "pinnedAlbums"],
  render: () => {
    albumsEnabled.checked = draft.pinnedAlbumsEnabled;
    renderAlbums();
  },
});
const backupSettings = new BackupSettings({
  isDirty: () =>
    familyBlacklistSettings.pendingInput ||
    JSON.stringify(draft) !== JSON.stringify(saved),
  isBusy: () => busy || savingGroups.size > 0 || !settingsReady,
  setApplying: (applying) => {
    busy = applying;
    for (const group of settingsGroups)
      if (group.host !== backupSettings.host) group.host.inert = applying;
  },
  imported: async () => {
    saved = await readSettings();
    draft = structuredClone(saved);
    renderSettings();
    renderAlbums();
    for (const status of app.querySelectorAll(".savebar .status"))
      status.textContent = "";
  },
});
const settingsGroups = [
  {
    id: "hover-tooltip",
    label: "Hover Tooltip",
    host: general,
    path: "M4 3h16v13H9l-5 5V3Z M8 7h8 M8 11h5",
  },
  {
    id: "pinned-albums",
    label: "Pinned Albums",
    host: albumSettings,
    path: "M5 3h14v18H5Z M8 3v18 M12 8h4 M12 12h4",
  },
  {
    id: "stat-boxes",
    label: "Tooltip Stat Boxes",
    host: statSettings.host,
    path: "M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z",
  },
  {
    id: "card-overlays",
    label: "Card Overlays",
    host: overlays,
    path: "M7 3h14v14H7Z M3 7v14h14 M12 7h4 M12 11h4",
  },
  {
    id: "family-impact-overlay",
    label: "Family Impact Overlay",
    host: familyImpact,
    path: "M12 3 3 8l9 5 9-5-9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5",
  },
  {
    id: "friend-tooltip",
    label: "Friend Tooltip",
    host: friendTooltipSettings.host,
    path: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  },
  {
    id: "profile-reminders",
    label: "Profile Reminders",
    host: profileSettings,
    path: "M4 3h16v18H4Z M8 15h8 M8 18h5 M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  },
  {
    id: "trade-reminders",
    label: "Trade Reminders",
    host: tradeSettings.host,
    path: "M3 7h18 M17 3l4 4-4 4 M21 17H3 M7 13l-4 4 4 4",
  },
  {
    id: "sales-overlay",
    label: "Sales Overlay",
    host: salesSettings.host,
    path: "M4 4h7l9 9-7 7-9-9V4Z M8 8h.01 M12 12l4 4",
  },
  {
    id: "navigation-hotkeys",
    label: "Navigation Hotkeys",
    host: hotkeySettings.host,
    path: "M3 5h18v14H3Z M7 9h.01 M11 9h.01 M15 9h.01 M7 12h.01 M11 12h.01 M15 12h.01 M7 15h10",
  },
  {
    id: "backup-restore",
    label: "Backup & Restore",
    host: backupSettings.host,
    path: "M12 3v12 M7 10l5 5 5-5 M4 15v6h16v-6",
  },
  {
    id: "connected-account",
    label: "Connected Account",
    host: connection,
    path: "M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2 M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  },
];
app.append(...settingsGroups.map((group) => group.host));
document.body.prepend(settingsNavigation(settingsGroups));
for (const event of ["input", "change", "click"])
  app.addEventListener(event, () =>
    queueMicrotask(() => backupSettings.refreshControls()),
  );
app.append(
  el(
    "p",
    "bottom",
    `KosMore ${chrome.runtime.getManifest().version} · Settings stay in this browser. Card and market data come from Kosmora.`,
  ),
);
function renderSettings() {
  tradeEnabled.checked = draft.tradeRemindersEnabled;
  tradeSettings.render(draft);
  profileEnabled.checked = draft.profileRemindersEnabled;
  profilePinned.checked = draft.profileRemindersPinned;
  friendTooltipEnabled.checked = draft.friendTooltipEnabled;
  friendTooltipSettings.render(draft);
  hotkeysEnabled.checked = draft.navigationHotkeysEnabled;
  overlaysEnabled.checked = draft.cardOverlaysEnabled;
  familyImpactEnabled.checked = draft.familyImpactOverlaysEnabled;
  salesEnabled.checked = draft.salesOverlaysEnabled;
  statsEnabled.checked = draft.statBoxesEnabled;
  albumsEnabled.checked = draft.pinnedAlbumsEnabled;
  enabled.checked = draft.enabled;
  disableHoverInPulsar.checked = draft.disableHoverTooltipInPulsar;
  disableHoverInVortex.checked = draft.disableHoverTooltipInVortex;
  disableOverlaysInPulsar.checked = draft.disableCardOverlaysInPulsar;
  disableOverlaysInVortex.checked = draft.disableCardOverlaysInVortex;
  useOverlayButton.checked = draft.useOverlayButtonInsteadOfHover;
  outsideClickOnly.checked = draft.outsideClickClosesTooltipOnly;
  fullScreenCentered.checked = draft.fullScreenCenteredOnOpen;
  syncTooltipSizing();
  closeAfterAlbumAdd.checked = draft.closeTooltipWhenAddedToAlbum;
  applyCloseToPinned.checked = draft.applyCloseBehaviorToPinnedTooltips;
  applyCloseToPinned.disabled = !draft.closeTooltipWhenAddedToAlbum;
  delay.value = String(draft.hoverDelayMs);
  for (const { field, input } of popupInputs)
    input.value = String(draft[field]);
  saleOverlay.checked = draft.showSaleHistoryOverlay;
  lastSalePriceOverlay.checked = draft.showLastSalePriceOverlay;
  lastSalePriceOverlay.disabled = !draft.showSaleHistoryOverlay;
  auctionOverlay.checked = draft.showActiveAuctionsOverlay;
  listingPriceOverlay.checked = draft.showLowestListingPriceOverlay;
  listingPriceOverlay.disabled = !draft.showActiveAuctionsOverlay;
  onSaleOverlay.checked = draft.showOnSaleOverlay;
  friendOverlay.checked = draft.showFriendInterestOverlay;
  questOverlay.checked = draft.showQuestOverlay;
  fusionFamilyOverlay.checked = draft.showFusionFamilyOverlay;
  tradeFamilyOverlay.checked = draft.showTradeFamilyOverlay;
  vortexFamilyOverlay.checked = draft.showVortexFamilyOverlay;
  salesFamilyOverlay.checked = draft.showSalesFamilyOverlay;
  familyBlacklistSettings.render(draft);
  statSettings.render(draft.stats);
  hotkeySettings.render(draft.hotkeys);
  salesSettings.render(draft);
  for (const host of [
    general,
    friendTooltipSettings.host,
    profileSettings,
    tradeSettings.host,
    albumSettings,
    statSettings.host,
    overlays,
    familyImpact,
    salesSettings.host,
    hotkeySettings.host,
  ])
    renderGroupState(host);
}
function pinned() {
  return selected ? (draft.pinnedAlbums[selected.account.key] ?? []) : [];
}
function setPins(ids: string[]) {
  if (selected) draft.pinnedAlbums[selected.account.key] = ids;
  renderAlbums();
}
function renderAlbums() {
  albumAccount.textContent = selected
    ? `Albums for ${selected.account.handle}. Change the connected account below.`
    : "Select a connected account below to choose its albums.";
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
  if (
    busy ||
    !settingsReady ||
    savingGroups.has(group.host) ||
    !featureGroups.get(group.host)!.input.checked
  )
    return;
  const error = group.validate?.();
  if (error) {
    status.className = "status error";
    status.textContent = error;
    return;
  }
  busy = true;
  savingGroups.add(group.host);
  renderGroupState(group.host);
  backupSettings.refreshControls();
  save.disabled = true;
  const values = Object.fromEntries(
    group.keys.map((key) => [key, structuredClone(draft[key])]),
  );
  try {
    const next = await queueSettingsWrite(async () => {
      const next = await readSettings();
      Object.assign(next, values);
      await saveSettings(next);
      return next;
    });
    for (const key of group.keys)
      Object.assign(saved, { [key]: structuredClone(next[key]) });
    status.className = "status success";
    status.textContent = "Saved. Changes apply to open Kosmora tabs.";
  } catch (error) {
    status.className = "status error";
    status.textContent = messageOf(error);
  } finally {
    busy = false;
    savingGroups.delete(group.host);
    renderGroupState(group.host);
    backupSettings.refreshControls();
  }
}
async function persistFeature(host: HTMLElement) {
  const { key, input } = featureGroups.get(host)!;
  if (!settingsReady || savingGroups.has(host)) return;
  const value = input.checked;
  const status = host.querySelector<HTMLElement>(":scope > .savebar .status")!;
  savingGroups.add(host);
  renderGroupState(host);
  status.className = "status";
  status.textContent = "Saving…";
  backupSettings.refreshControls();
  try {
    await queueSettingsWrite(async () => {
      const next = await readSettings();
      next[key] = value;
      await saveSettings(next);
    });
    saved[key] = value;
    status.className = "status success";
    status.textContent = "Saved. Changes apply to open Kosmora tabs.";
  } catch (error) {
    draft[key] = saved[key];
    input.checked = saved[key];
    status.className = "status error";
    status.textContent = `Could not save the feature switch: ${messageOf(error)}`;
  } finally {
    savingGroups.delete(host);
    renderGroupState(host);
    backupSettings.refreshControls();
  }
}
void readSettings()
  .then((s) => {
    saved = s;
    draft = structuredClone(s);
    settingsReady = true;
    renderSettings();
    renderAlbums();
    settingsReady = true;
    backupSettings.refreshControls();
    return discover();
  })
  .catch((error) => {
    settingsReady = true;
    backupSettings.refreshControls();
    app.append(note(`Could not load settings: ${messageOf(error)}`, true));
  });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) return;
  const next = parseSettings(changes[SETTINGS_KEY].newValue);
  for (const [host, { key, input }] of featureGroups) {
    if (draft[key] === saved[key]) draft[key] = next[key];
    saved[key] = next[key];
    input.checked = draft[key];
    renderGroupState(host);
  }
  for (const { field, input } of popupInputs) {
    if (field !== "popupWidth" && field !== "popupHeight") continue;
    if (draft[field] === saved[field]) {
      draft[field] = next[field];
      input.value = String(next[field]);
    }
    saved[field] = next[field];
  }
  for (const { field, input } of friendTooltipSettings.inputs) {
    if (field !== "friendTooltipWidth" && field !== "friendTooltipHeight")
      continue;
    if (draft[field] === saved[field]) {
      draft[field] = next[field];
      input.value = String(next[field]);
    }
    saved[field] = next[field];
  }
  for (const [field, input] of [
    ...tradeSettings.inputs.map(({ field, input }) => [field, input] as const),
    ["profileRemindersPinned", profilePinned],
  ] as const) {
    if (draft[field] === saved[field]) {
      draft[field] = next[field];
      input.checked = next[field];
    }
    saved[field] = next[field];
  }
  for (const { field, input } of tradeSettings.numberInputs) {
    if (draft[field] === saved[field]) {
      draft[field] = next[field];
      input.value = String(next[field]);
    }
    saved[field] = next[field];
  }
  renderGroupState(profileSettings);
  tradeSettings.render(draft);
  renderGroupState(tradeSettings.host);
  saved.friendTooltipPosition = next.friendTooltipPosition;
  draft.friendTooltipPosition = next.friendTooltipPosition;
  saved.popupPosition = next.popupPosition;
  draft.popupPosition = next.popupPosition;
  for (const key of ["useFamilyBlacklist", "familyBlacklist"] as const) {
    if (JSON.stringify(draft[key]) === JSON.stringify(saved[key]))
      Object.assign(draft, { [key]: structuredClone(next[key]) });
    Object.assign(saved, { [key]: structuredClone(next[key]) });
  }
  familyBlacklistSettings.render(draft);
  backupSettings.refreshControls();
});
