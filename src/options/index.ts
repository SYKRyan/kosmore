import "./options.css";
import "../content/stat-box.css";
import { StatSettings } from "./stat-settings";
import { HotkeySettings, shortcutControls } from "./hotkey-settings";
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
import {
  hotkeyConflict,
  NAVIGATION,
  PACK_OPENING,
  HOVER_TOOLTIP,
  type Shortcut,
} from "../shared/hotkeys";
import { button, el, note } from "../content/ui";
import { headerIcon } from "../content/icons";
import {
  readSettings,
  saveSettings,
  defaults,
  parseSettings,
  SETTINGS_KEY,
} from "../shared/settings";
import { request, type Session } from "../shared/messages";
import { validFusionPriceThreshold } from "../shared/sales-prices";
import { messageOf, type Album, type Settings } from "../shared/types";
const app = document.getElementById("app")!;
type FeatureKey =
  | "enabled"
  | "socialRemindersMasterEnabled"
  | "profileRemindersEnabled"
  | "socialRemindersEnabled"
  | "tradeRemindersEnabled"
  | "friendTooltipEnabled"
  | "hotkeysEnabled"
  | "navigationHotkeysEnabled"
  | "hoverTooltipHotkeysEnabled"
  | "packOpeningHotkeysEnabled"
  | "showRemainingPackCount"
  | "fusionEnabled"
  | "cardOverlaysEnabled"
  | "familyImpactOverlaysEnabled"
  | "salesOverlaysEnabled"
  | "statBoxesEnabled"
  | "collectSaleRateData"
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
const tooltipTakesFocus = checkboxSetting(
  "tooltip-takes-focus",
  "Tooltip takes focus",
  "Clear focus from the active control when hovering a card opens or updates its tooltip, so album shortcuts work after typing.",
  (checked) => {
    draft.tooltipTakesFocus = checked;
  },
  general,
);
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
const hotkeySettings = new HotkeySettings(
  "Navigation",
  NAVIGATION,
  (hotkeys) => {
    draft.hotkeys = hotkeys;
  },
);
const packHotkeySettings = new HotkeySettings(
  "Pack Opening",
  PACK_OPENING,
  (hotkeys) => {
    draft.packOpeningHotkeys = hotkeys;
  },
  true,
);
const tooltipHotkeySettings = new HotkeySettings(
  "Hover Tooltip",
  HOVER_TOOLTIP,
  (hotkeys) => {
    draft.hoverTooltipHotkeys = hotkeys;
  },
  true,
);
const hotkeysPanel = el("section", "panel");
hotkeysPanel.setAttribute("aria-label", "Hotkeys");
hotkeySettings.host.id = "navigation-hotkeys";
packHotkeySettings.host.id = "pack-opening-hotkeys";
tooltipHotkeySettings.host.id = "hover-tooltip-hotkeys";
const hotkeySubgroups = el(
  "fieldset",
  "settings-group-content hotkey-subgroups",
);
hotkeySubgroups.setAttribute("aria-label", "Hotkey subgroups");
hotkeySubgroups.append(
  hotkeySettings.host,
  packHotkeySettings.host,
  tooltipHotkeySettings.host,
);
const hotkeysStatus = el("p", "status");
hotkeysStatus.setAttribute("data-feature-status", "");
hotkeysStatus.setAttribute("role", "status");
hotkeysPanel.append(
  el("h2", "", "Hotkeys"),
  el(
    "p",
    "sub hotkeys-subtitle",
    "Choose a letter, number, or F-key with optional Ctrl, Alt, Shift, or Meta. Pack Opening and Hover Tooltip also accept arrows, Home, and End. Escape cancels recording. Shortcuts pause while typing, and browser-reserved keys may not reach KosMore. The master switch also controls pinned album shortcuts.",
  ),
  hotkeySubgroups,
  hotkeysStatus,
);
const packBehavior = el("section", "panel");
const packHeading = el("div", "settings-group-heading");
packHeading.append(el("h2", "", "Pack Openings"));
packBehavior.append(packHeading);
function syncTooltipSizing() {
  for (const { field, input } of popupInputs)
    if (field === "popupWidth" || field === "popupHeight")
      input.disabled = draft.fullScreenCenteredOnOpen;
}
function sectionToggle(
  host: HTMLElement,
  key: FeatureKey,
  label: string,
  confirmEnable?: (enable: () => void) => void,
) {
  const heading = host.querySelector("h2, h3")!;
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
  const commit = () => {
    draft[key] = input.checked;
    void persistFeature(host, key, input);
  };
  input.addEventListener("change", () => {
    if (input.checked && !draft[key] && confirmEnable) {
      input.checked = false;
      confirmEnable(() => {
        if (input.disabled || draft[key]) return;
        input.checked = true;
        commit();
      });
      return;
    }
    commit();
  });
  heading.replaceWith(row);
  const state = el("span", "settings-group-state", "Disabled");
  state.hidden = input.checked;
  row.append(heading, state, input);
  return input;
}
function renderGroupState(host: HTMLElement) {
  const input = featureGroups.get(host)?.input;
  const disabled = groupDisabled(host);
  const saving = savingGroups.has(host);
  if (input) input.disabled = !settingsReady || saving;
  host.classList.toggle("settings-group-disabled", disabled);
  const content = host.querySelector<HTMLFieldSetElement>(
    ":scope > .settings-group-content",
  );
  if (content) content.disabled = disabled || saving || !settingsReady;
  if (host === packBehavior)
    anyKeyDismissesFoundPack.disabled = !draft.hotkeysEnabled;
  if (host === fusion) fusionWarning.hidden = disabled;
  for (const input of host.querySelectorAll<HTMLInputElement>(
    ".settings-group-independent input",
  ))
    input.disabled = saving || !settingsReady;
  for (const button of host.querySelectorAll<HTMLButtonElement>(
    ":scope > .savebar button",
  ))
    button.disabled = disabled || saving || !settingsReady;
  const state = host.querySelector<HTMLElement>(".settings-group-state");
  if (state) state.hidden = !disabled;
}
function groupDisabled(host: HTMLElement) {
  return host === packBehavior
    ? !draft.packOpeningHotkeysEnabled
    : featureGroups.get(host)?.input.checked === false;
}
const allHotkeysEnabled = sectionToggle(
  hotkeysPanel,
  "hotkeysEnabled",
  "Enable all hotkeys",
);
const navigationHotkeysEnabled = sectionToggle(
  hotkeySettings.host,
  "navigationHotkeysEnabled",
  "Enable navigation hotkey",
);
const packHotkeysEnabled = sectionToggle(
  packHotkeySettings.host,
  "packOpeningHotkeysEnabled",
  "Enable pack opening hotkeys",
);
const hoverHotkeysEnabled = sectionToggle(
  tooltipHotkeySettings.host,
  "hoverTooltipHotkeysEnabled",
  "Enable hover tooltip hotkeys",
);
const friendTooltipSettings = new FriendTooltipSettings((update) =>
  Object.assign(draft, update),
);
const friendTooltipEnabled = sectionToggle(
  friendTooltipSettings.host,
  "friendTooltipEnabled",
  "Enable friend tooltip",
);
const socialSettings = el("section", "panel");
socialSettings.append(
  el("h2", "", "Social Reminders"),
  el(
    "p",
    "sub",
    "Social and player profiles share the same private families and notes. Choose where the reminder editor appears and whether it stays pinned on each page.",
  ),
);
const socialRemindersMaster = sectionToggle(
  socialSettings,
  "socialRemindersMasterEnabled",
  "Enable social reminders",
);
const reminderControls = (
  [
    {
      enabledKey: "socialRemindersEnabled",
      pinnedKey: "socialRemindersPinned",
      pinnedId: "social-reminders-pinned",
      label: "Show on social page",
      pinLabel: "Keep reminders pinned on Social",
      hint: "Find KosMore below Collection and Profile and above Between You on a friend's Social card.",
    },
    {
      enabledKey: "profileRemindersEnabled",
      pinnedKey: "profileRemindersPinned",
      pinnedId: "profile-reminders-pinned",
      label: "Show on profile page",
      pinLabel: "Keep reminders pinned on profiles",
      hint: "Find KosMore below a player's profile header and above Albums.",
    },
  ] as const
).map(({ enabledKey, pinnedKey, pinnedId, label, pinLabel, hint }) => {
  const enabled = checkboxSetting(
    enabledKey,
    label,
    hint,
    async (checked) => {
      draft[enabledKey] = checked;
      await persistFeature(socialSettings, enabledKey, enabled);
      renderReminderSettings();
    },
    socialSettings,
  );
  const row = el("div", "row settings-subsetting"),
    pinned = el("input", "section-switch"),
    text = el("label", "label settings-toggle", pinLabel);
  pinned.type = "checkbox";
  pinned.id = pinnedId;
  pinned.setAttribute("role", "switch");
  pinned.addEventListener("change", () => {
    draft[pinnedKey] = pinned.checked;
  });
  text.prepend(pinned);
  row.append(text);
  socialSettings.append(row);
  return { enabledKey, pinnedKey, enabled, pinned };
});
function renderReminderSettings() {
  for (const { enabledKey, pinnedKey, enabled, pinned } of reminderControls) {
    enabled.checked = draft[enabledKey];
    pinned.checked = draft[pinnedKey];
    pinned.disabled = !enabled.checked;
  }
}
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
function checkboxSetting(
  id: string,
  label: string,
  hint: string,
  update: (checked: boolean) => void,
  host: HTMLElement = overlays,
  role: "checkbox" | "switch" = "checkbox",
) {
  const row = el("div", "row"),
    input = el("input", role === "switch" ? "section-switch" : ""),
    text = el("label", "label settings-toggle", label);
  input.type = "checkbox";
  input.id = id;
  if (role === "switch") input.setAttribute("role", role);
  text.prepend(input);
  row.append(text);
  if (hint) row.append(el("span", "hint", hint));
  input.addEventListener("change", () => update(input.checked));
  host.append(el("div", "rule"), row);
  return input;
}
const anyKeyDismissesFoundPack = checkboxSetting(
  "anyKeyDismissesFoundPack",
  "Any key dismisses found pack",
  "Press any key to continue past a found pack. When off, the Dismiss Found Pack keybind is used instead.",
  (checked) => {
    draft.anyKeyDismissesFoundPack = checked;
  },
  packBehavior,
);
const autoSkipOpening = checkboxSetting(
  "autoSkipOpening",
  "Auto-skip on next pack",
  "After using Next Pack with the mouse or a hotkey, press Skip once when the next pack appears. Requires Kosmora’s reveal hints. If a warning appears, choose how to continue.",
  (checked) => {
    draft.autoSkipOpening = checked;
  },
  packBehavior,
);
const autoDismissFoundPack = checkboxSetting(
  "autoDismissFoundPack",
  "Auto-dismiss found pack",
  "Automatically continue past the full-screen Rogue and Mega pack alerts. The found packs still appear on the summary above the cards.",
  (checked) => {
    draft.autoDismissFoundPack = checked;
  },
  packBehavior,
);
const packDisplaySettings = el("div", "settings-group-independent");
packHeading.after(packDisplaySettings);
const showRemainingPackCount = checkboxSetting(
  "showRemainingPackCount",
  "Show remaining pack count",
  "Show how many ready packs remain above Open the Next Pack.",
  (checked) => {
    draft.showRemainingPackCount = checked;
    void persistFeature(
      packBehavior,
      "showRemainingPackCount",
      showRemainingPackCount,
    );
  },
  packDisplaySettings,
);
const fusion = el("section", "panel");
fusion.append(el("h2", "", "Fusion"));
const fusionWarningText =
  'This feature has been reviewed by the developer. Although approved for use, it may result in "sus points" on your account. Use at your own risk.';
const fusionDialog = el("dialog", "panel settings-dialog");
const fusionDialogTitle = el("h2", "", "Enable Fusion Batches?");
fusionDialogTitle.id = "fusion-dialog-title";
const fusionDialogWarning = el("p", "notice", fusionWarningText);
fusionDialogWarning.id = "fusion-dialog-warning";
fusionDialog.setAttribute("aria-labelledby", fusionDialogTitle.id);
fusionDialog.setAttribute("aria-describedby", fusionDialogWarning.id);
const fusionDialogActions = el("div", "save-actions");
const fusionDismiss = button("Nevermind", () => fusionDialog.close(), "ghost");
fusionDismiss.autofocus = true;
fusionDialogActions.append(
  fusionDismiss,
  button(
    "Enabled Fusion Batches",
    () => fusionDialog.close("enable"),
    "primary",
  ),
);
fusionDialog.append(
  fusionDialogTitle,
  fusionDialogWarning,
  fusionDialogActions,
);
document.body.append(fusionDialog);
const fusionEnabled = sectionToggle(
  fusion,
  "fusionEnabled",
  "Enable Fusion",
  (enable) => {
    fusionDialog.returnValue = "";
    fusionDialog.addEventListener(
      "close",
      () => {
        if (fusionDialog.returnValue === "enable") enable();
      },
      { once: true },
    );
    fusionDialog.showModal();
  },
);
const fusionWarning = el("p", "sub");
fusionWarning.hidden = true;
fusionWarning.append(el("strong", "", fusionWarningText));
fusion.append(fusionWarning);
const fusionFilters = el("fieldset", "fusion-subsettings");
fusionFilters.id = "fusion-next-batch-filters";
fusionFilters.setAttribute("aria-label", "Next Batch filters");
const fusionNextBatch = checkboxSetting(
  "fusionNextBatchEnabled",
  "Enable Next Batch button",
  "Fill available slots in the Fusion tray with eligible cards.",
  (checked) => {
    draft.fusionNextBatchEnabled = checked;
    syncFusionFields();
  },
  fusion,
);
fusionNextBatch.setAttribute("aria-controls", fusionFilters.id);
fusion.append(fusionFilters);
const fusionToggles = [
  [
    "fusionRespectFamilyImpact",
    "Respect Family Impact",
    "Skip cards that would lower a family tier.",
  ],
  [
    "fusionRespectBlacklist",
    "Respect Blacklist",
    "Skip cards in any family on your saved blacklist.",
  ],
  [
    "fusionRespectPriceThreshold",
    "Respect Price Threshold",
    "Skip a finish with any completed sale above the threshold in its 30-day history.",
  ],
  ["fusionExcludeFullArts", "Exclude Full Arts", ""],
  ["fusionExcludeShiny", "Exclude Shiny", ""],
  ["fusionExcludeNumberOnes", "Exclude #1s", ""],
] as const;
const fusionFilterInputs = fusionToggles.map(([key, label, hint]) => {
  const input = checkboxSetting(
    key,
    label,
    hint,
    (checked) => {
      draft[key] = checked;
      syncFusionFields();
    },
    fusionFilters,
    "switch",
  );
  return { key, input };
});
const fusionPriceRow = el("div", "row settings-subsetting");
const fusionPriceLabel = el("label", "label", "Price threshold (Kosmo)");
const fusionPrice = el("input");
fusionPrice.id = "fusionPriceThreshold";
fusionPrice.type = "number";
fusionPrice.min = "0";
fusionPrice.step = "0.000001";
fusionPriceLabel.htmlFor = fusionPrice.id;
fusionPriceRow.append(fusionPriceLabel, fusionPrice);
const fusionPriceFilter = fusionFilters.querySelector(
  "#fusionRespectPriceThreshold",
)!;
fusionPriceFilter.setAttribute("aria-controls", fusionPrice.id);
fusionPriceFilter.closest(".row")!.append(fusionPriceRow);
fusionPrice.addEventListener("input", () => {
  draft.fusionPriceThreshold = fusionPrice.valueAsNumber;
});
const fusionKeys = [
  "fusionNextBatchEnabled",
  ...fusionToggles.map(([key]) => key),
  "fusionPriceThreshold",
] as const;
function syncFusionFields() {
  fusionFilters.disabled = !draft.fusionNextBatchEnabled;
  fusionPrice.disabled =
    !draft.fusionNextBatchEnabled || !draft.fusionRespectPriceThreshold;
}
function renderFusionSettings() {
  fusionNextBatch.checked = draft.fusionNextBatchEnabled;
  for (const { key, input } of fusionFilterInputs) input.checked = draft[key];
  if (validFusionPriceThreshold(draft.fusionPriceThreshold))
    fusionPrice.value = String(draft.fusionPriceThreshold);
  syncFusionFields();
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
const auctionOverlay = checkboxSetting(
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
const onSaleOverlay = checkboxSetting(
  "on-sale-overlay",
  "Show For Sale label on cards",
  "Black and white label · you have a copy listed on the market",
  (checked) => {
    draft.showOnSaleOverlay = checked;
  },
);
const saleOverlay = checkboxSetting(
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
const friendOverlay = checkboxSetting(
  "friend-interest-overlay",
  "Show interested friends icon on cards",
  "Friends · matching saved family preferences",
  (checked) => {
    draft.showFriendInterestOverlay = checked;
  },
);
const questOverlay = checkboxSetting(
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
const familyImpactBadgeHint =
  "✓ Safe means no family loses a tier. ⚠ Loses shows the family and tier that would drop.";
const fusionFamilyOverlay = checkboxSetting(
  "fusion-family-overlay",
  "Show on Fusion page",
  `Badges appear at the bottom left of each card. Checks count the cards already selected for fusion. ${familyImpactBadgeHint}`,
  (checked) => {
    draft.showFusionFamilyOverlay = checked;
  },
  familyImpact,
);
const tradeFamilyOverlay = checkboxSetting(
  "trade-family-overlay",
  "Show on Trade page",
  `Badges appear at the bottom left of your card choices. Checks assume you trade one copy. ${familyImpactBadgeHint}`,
  (checked) => {
    draft.showTradeFamilyOverlay = checked;
  },
  familyImpact,
);
const vortexFamilyOverlay = checkboxSetting(
  "vortex-family-overlay",
  "Show on Vortex page",
  `Badges appear at the bottom left of stake cards and card picker choices. Checks assume you lose one copy. ${familyImpactBadgeHint}`,
  (checked) => {
    draft.showVortexFamilyOverlay = checked;
  },
  familyImpact,
);
const salesFamilyOverlay = checkboxSetting(
  "sales-family-overlay",
  "Show on Sell pages",
  `Badges appear on Sell Many card choices and beneath each sale listing. Checks update as you select cards or remove listings. ${familyImpactBadgeHint}`,
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
  statSettings.render(draft.stats, draft.collectSaleRateData);
});
const statsEnabled = sectionToggle(
  statSettings.host,
  "statBoxesEnabled",
  "Enable stat boxes",
);
const saleRateControls = el("div", "settings-group-independent");
const collectSaleRate = checkboxSetting(
  "collectSaleRateData",
  "Collect Sale Rate data",
  "Record listing outcomes for Sale Rate. Pause collection to reduce background work.",
  async (checked) => {
    draft.collectSaleRateData = checked;
    statSettings.render(draft.stats, checked);
    await persistFeature(
      statSettings.host,
      "collectSaleRateData",
      collectSaleRate,
    );
    statSettings.render(draft.stats, draft.collectSaleRateData);
  },
  saleRateControls,
);
collectSaleRate.setAttribute("role", "switch");
delay.addEventListener("input", () => {
  draft.hoverDelayMs = Number(delay.value);
});
const connection = el("section", "panel"),
  connectionContent = el("div", "settings-group-content"),
  accountRow = el("div", "account-row"),
  select = el("select");
select.setAttribute("aria-label", "Kosmora account");
connection.append(el("h2", "", "Connected Account"), connectionContent);
connectionContent.append(
  el(
    "p",
    "sub",
    "Select the Kosmora account used for pinned albums. Keep a signed-in game tab open.",
  ),
);
const refresh = button(
  "Refresh accounts",
  () => void discover(),
  "ghost small",
);
accountRow.append(select, refresh);
const connectionStatus = el("div");
connectionContent.append(el("div", "rule"), accountRow, connectionStatus);
connection.setAttribute("aria-label", "connected account");
const albumSettings = el("section", "panel");
albumSettings.append(
  el("h2", "", "Pinned Albums"),
  el(
    "p",
    "sub",
    "Choose the albums that appear as shortcuts in the card tooltip. Set a shortcut in an album’s row to add the selected card while its tooltip is open. Use a letter, number, or F-key with optional Ctrl, Alt, Shift, or Meta. Escape cancels recording, and Clear removes the shortcut. Shortcuts pause while typing.",
  ),
);
const albumsEnabled = sectionToggle(
  albumSettings,
  "pinnedAlbumsEnabled",
  "Enable pinned albums",
);
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
const albumShortcutHint = el("p", "sub");
albumShortcutHint.setAttribute("aria-live", "polite");
pinnedPanel.append(
  el("h2", "", "Pinned Shortcuts"),
  el("p", "sub", "Buttons appear in this order in the card tooltip."),
  albumShortcutHint,
  pins,
);
grid.append(catalogPanel, pinnedPanel);
grid.style.marginTop = "18px";
albumSettings.append(grid);
type SettingsGroup = {
  host: HTMLElement;
  name: string;
  keys: (keyof Settings)[];
  validateSave?: (settings: Settings) => string | undefined;
  validate?: () => string | undefined;
  render: () => void;
};
function groupControls(group: SettingsGroup) {
  group.host.setAttribute("aria-label", group.name);
  const content = el("fieldset", "settings-group-content");
  content.setAttribute("aria-label", `${group.name} options`);
  for (const child of [...group.host.children])
    if (
      !child.matches("h3, .settings-group-heading, .settings-group-independent")
    )
      content.append(child);
  group.host.append(content);
  renderGroupState(group.host);
  const status = el("p", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const save = button(
    "Save",
    () => void persist(group, status, save),
    "primary settings-action",
  );
  const cancel = button(
    "Cancel",
    () => {
      for (const key of group.keys)
        Object.assign(draft, { [key]: structuredClone(saved[key]) });
      group.render();
      renderGroupState(group.host);
      status.textContent = "Unsaved changes discarded.";
    },
    "ghost settings-action",
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
    "tooltipTakesFocus",
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
  name: "navigation hotkeys",
  keys: ["navigationHotkeysEnabled", "hotkeys"],
  render: renderSettings,
  validateSave: validateShortcuts,
});
groupControls({
  host: packHotkeySettings.host,
  name: "pack opening",
  keys: ["packOpeningHotkeysEnabled", "packOpeningHotkeys"],
  render: renderSettings,
  validateSave: validateShortcuts,
});
groupControls({
  host: tooltipHotkeySettings.host,
  name: "hover tooltip hotkeys",
  keys: ["hoverTooltipHotkeysEnabled", "hoverTooltipHotkeys"],
  render: renderSettings,
  validateSave: validateShortcuts,
});
groupControls({
  host: packBehavior,
  name: "pack openings",
  keys: ["anyKeyDismissesFoundPack", "autoSkipOpening", "autoDismissFoundPack"],
  render: renderSettings,
});
groupControls({
  host: fusion,
  name: "fusion settings",
  keys: [...fusionKeys],
  render: renderFusionSettings,
  validate: () => {
    if (validFusionPriceThreshold(draft.fusionPriceThreshold)) return;
    if (fusionPrice.disabled) {
      draft.fusionPriceThreshold = saved.fusionPriceThreshold;
      renderFusionSettings();
      return;
    }
    fusionPrice.focus();
    return "Enter a nonnegative price threshold with up to six decimal places.";
  },
});
groupControls({
  host: friendTooltipSettings.host,
  name: "friend tooltip settings",
  keys: [...FRIEND_TOOLTIP_KEYS],
  render: renderSettings,
  validate: () => friendTooltipSettings.validate(draft),
});
groupControls({
  host: socialSettings,
  name: "social reminder settings",
  keys: reminderControls.map(({ pinnedKey }) => pinnedKey),
  render: renderReminderSettings,
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
statSettings.host.querySelector(":scope > .savebar")!.before(saleRateControls);
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
  keys: ["pinnedAlbumsEnabled", "pinnedAlbums", "pinnedAlbumHotkeys"],
  validateSave: validateShortcuts,
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
    path: "M10.3 4.9a2 2 0 0 1 3.4 0l8.1 13.5a1.7 1.7 0 0 1-1.5 2.6H3.7a1.7 1.7 0 0 1-1.5-2.6Z M12 9v4 M12 17h.01",
  },
  {
    id: "friend-tooltip",
    label: "Friend Tooltip",
    host: friendTooltipSettings.host,
    path: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  },
  {
    id: "social-reminders",
    label: "Social Reminders",
    host: socialSettings,
    path: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z M10 21a2 2 0 0 0 4 0",
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
    id: "hotkeys",
    label: "Hotkeys",
    host: hotkeysPanel,
    path: "M3 5h18v14H3Z M7 9h.01 M11 9h.01 M15 9h.01 M7 12h.01 M11 12h.01 M15 12h.01 M7 15h10",
  },
  {
    id: "pack-openings",
    label: "Pack Openings",
    host: packBehavior,
    path: "M6.9 5.3 15.9 2a1.5 1.5 0 0 1 1.9.9l5.1 14a1.5 1.5 0 0 1-.9 1.9l-9 3.3a1.5 1.5 0 0 1-1.9-.9L6 7.2a1.5 1.5 0 0 1 .9-1.9Z M4.5 11.5 2 16.5a1.5 1.5 0 0 0 .7 2L7 20.6 M13.2 8.4l3.6 2.8-1.1 4.5-3.7-2.9Z",
  },
  {
    id: "fusion",
    label: "Fusion",
    host: fusion,
    path: "M3 4h5v7H3Z M16 4h5v7h-5Z M6 11v3l6 4 6-4v-3 M12 16v6 M9 19h6",
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
  socialRemindersMaster.checked = draft.socialRemindersMasterEnabled;
  renderReminderSettings();
  tradeEnabled.checked = draft.tradeRemindersEnabled;
  tradeSettings.render(draft);
  friendTooltipEnabled.checked = draft.friendTooltipEnabled;
  friendTooltipSettings.render(draft);
  allHotkeysEnabled.checked = draft.hotkeysEnabled;
  navigationHotkeysEnabled.checked = draft.navigationHotkeysEnabled;
  packHotkeysEnabled.checked = draft.packOpeningHotkeysEnabled;
  hoverHotkeysEnabled.checked = draft.hoverTooltipHotkeysEnabled;
  anyKeyDismissesFoundPack.checked = draft.anyKeyDismissesFoundPack;
  autoSkipOpening.checked = draft.autoSkipOpening;
  autoDismissFoundPack.checked = draft.autoDismissFoundPack;
  showRemainingPackCount.checked = draft.showRemainingPackCount;
  overlaysEnabled.checked = draft.cardOverlaysEnabled;
  familyImpactEnabled.checked = draft.familyImpactOverlaysEnabled;
  fusionEnabled.checked = draft.fusionEnabled;
  renderFusionSettings();
  salesEnabled.checked = draft.salesOverlaysEnabled;
  statsEnabled.checked = draft.statBoxesEnabled;
  collectSaleRate.checked = draft.collectSaleRateData;
  albumsEnabled.checked = draft.pinnedAlbumsEnabled;
  enabled.checked = draft.enabled;
  disableHoverInPulsar.checked = draft.disableHoverTooltipInPulsar;
  disableHoverInVortex.checked = draft.disableHoverTooltipInVortex;
  disableOverlaysInPulsar.checked = draft.disableCardOverlaysInPulsar;
  disableOverlaysInVortex.checked = draft.disableCardOverlaysInVortex;
  useOverlayButton.checked = draft.useOverlayButtonInsteadOfHover;
  tooltipTakesFocus.checked = draft.tooltipTakesFocus;
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
  statSettings.render(draft.stats, draft.collectSaleRateData);
  hotkeySettings.render(draft.hotkeys);
  packHotkeySettings.render(draft.packOpeningHotkeys);
  tooltipHotkeySettings.render(draft.hoverTooltipHotkeys);
  salesSettings.render(draft);
  for (const host of [
    general,
    friendTooltipSettings.host,
    socialSettings,
    tradeSettings.host,
    albumSettings,
    statSettings.host,
    overlays,
    familyImpact,
    salesSettings.host,
    hotkeysPanel,
    hotkeySettings.host,
    packHotkeySettings.host,
    tooltipHotkeySettings.host,
    packBehavior,
    fusion,
  ])
    renderGroupState(host);
}
function pinned() {
  return selected ? (draft.pinnedAlbums[selected.account.key] ?? []) : [];
}
function setPins(ids: string[]) {
  if (selected) {
    const key = selected.account.key;
    draft.pinnedAlbums = { ...draft.pinnedAlbums, [key]: ids };
    for (const id of Object.keys(draft.pinnedAlbumHotkeys[key] ?? {}))
      if (!ids.includes(id)) setAlbumShortcut(key, id, undefined);
  }
  renderAlbums();
}
function setAlbumShortcut(
  account: string,
  id: string,
  shortcut: Shortcut | undefined,
) {
  const bindings = { ...draft.pinnedAlbumHotkeys[account] };
  if (shortcut) bindings[id] = shortcut;
  else delete bindings[id];
  draft.pinnedAlbumHotkeys = {
    ...draft.pinnedAlbumHotkeys,
    [account]: bindings,
  };
  if (!Object.keys(bindings).length) delete draft.pinnedAlbumHotkeys[account];
}
function validateShortcuts(next: Settings) {
  return hotkeyConflict(
    next.hotkeys,
    next.packOpeningHotkeys,
    next.pinnedAlbumHotkeys,
    new Map(albums.map(({ id, name }) => [id, name])),
    next.hoverTooltipHotkeys,
  );
}
const ALBUM_ACCOUNT_SETTINGS = ["pinnedAlbums", "pinnedAlbumHotkeys"] as const;
function changedAlbumAccounts() {
  const accounts = new Set([
    ...Object.keys(saved.pinnedAlbums),
    ...Object.keys(draft.pinnedAlbums),
  ]);
  return [...accounts].filter((account) =>
    ALBUM_ACCOUNT_SETTINGS.some(
      (key) =>
        JSON.stringify(draft[key][account]) !==
        JSON.stringify(saved[key][account]),
    ),
  );
}
function renderAlbums() {
  const ids = pinned();
  catalog.replaceChildren();
  pins.replaceChildren();
  albumShortcutHint.textContent = "";
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
  const account = selected.account.key;
  ids.forEach((id, index) => {
    const album = albums.find((a) => a.id === id),
      row = el("div", "album-row pinned-album-row"),
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
      "",
      () => setPins(ids.filter((x) => x !== id)),
      "small ghost",
    );
    remove.append(headerIcon("close"));
    remove.setAttribute(
      "aria-label",
      `Unpin ${album?.name ?? "unavailable album"}`,
    );
    actions.append(remove);
    row.append(
      name,
      actions,
      shortcutControls(
        id,
        album?.name ?? "unavailable album",
        draft.pinnedAlbumHotkeys[account]?.[id],
        (shortcut) => setAlbumShortcut(account, id, shortcut),
        albumShortcutHint,
      ),
    );
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
    groupDisabled(group.host)
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
  const albumAccounts =
    group.host === albumSettings ? changedAlbumAccounts() : undefined;
  try {
    const next = await queueSettingsWrite(async () => {
      const next = await readSettings();
      if (albumAccounts) {
        // Save the changed accounts' pins and bindings together while retaining other accounts.
        for (const key of ALBUM_ACCOUNT_SETTINGS) {
          const edited = values[key] as Record<string, unknown>;
          const merged: Record<string, unknown> = { ...next[key] };
          for (const account of albumAccounts) delete merged[account];
          values[key] = {
            ...merged,
            ...Object.fromEntries(
              albumAccounts
                .filter((account) => Object.hasOwn(edited, account))
                .map((account) => [account, edited[account]]),
            ),
          };
        }
      }
      Object.assign(next, values);
      const conflict = group.validateSave?.(next);
      if (conflict) throw new Error(conflict);
      await saveSettings(next);
      return next;
    });
    for (const key of group.keys)
      Object.assign(saved, { [key]: structuredClone(next[key]) });
    if (albumAccounts) {
      for (const key of ALBUM_ACCOUNT_SETTINGS)
        Object.assign(draft, { [key]: structuredClone(next[key]) });
      renderAlbums();
    }
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
async function persistFeature(
  host: HTMLElement,
  key: FeatureKey,
  input: HTMLInputElement,
) {
  if (!settingsReady || savingGroups.has(host)) return;
  const value = input.checked;
  if (key === "packOpeningHotkeysEnabled" || key === "hotkeysEnabled")
    renderGroupState(packBehavior);
  const status = host.querySelector<HTMLElement>(
    ":scope > .savebar .status, :scope > [data-feature-status]",
  )!;
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
    if (key === "packOpeningHotkeysEnabled" || key === "hotkeysEnabled")
      renderGroupState(packBehavior);
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
  renderGroupState(packBehavior);
  for (const [key, render] of [
    ["hotkeys", () => hotkeySettings.render(draft.hotkeys)],
    [
      "packOpeningHotkeys",
      () => packHotkeySettings.render(draft.packOpeningHotkeys),
    ],
    [
      "hoverTooltipHotkeys",
      () => tooltipHotkeySettings.render(draft.hoverTooltipHotkeys),
    ],
  ] as const) {
    const unchanged = JSON.stringify(draft[key]) === JSON.stringify(saved[key]);
    if (unchanged && JSON.stringify(saved[key]) !== JSON.stringify(next[key])) {
      Object.assign(draft, { [key]: structuredClone(next[key]) });
      render();
    }
    Object.assign(saved, { [key]: structuredClone(next[key]) });
  }
  for (const [key, input] of [
    ["anyKeyDismissesFoundPack", anyKeyDismissesFoundPack],
    ["autoSkipOpening", autoSkipOpening],
    ["autoDismissFoundPack", autoDismissFoundPack],
    ["showRemainingPackCount", showRemainingPackCount],
    ["collectSaleRateData", collectSaleRate],
  ] as const) {
    if (draft[key] === saved[key]) {
      draft[key] = next[key];
      input.checked = next[key];
    }
    saved[key] = next[key];
  }
  statSettings.render(draft.stats, draft.collectSaleRateData);
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
  for (const { enabledKey, pinnedKey } of reminderControls) {
    for (const key of [enabledKey, pinnedKey]) {
      if (draft[key] === saved[key]) draft[key] = next[key];
      saved[key] = next[key];
    }
  }
  for (const { field, input } of tradeSettings.inputs) {
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
  renderReminderSettings();
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
  for (const key of fusionKeys) {
    if (draft[key] === saved[key]) Object.assign(draft, { [key]: next[key] });
    Object.assign(saved, { [key]: next[key] });
  }
  renderFusionSettings();
  backupSettings.refreshControls();
});
